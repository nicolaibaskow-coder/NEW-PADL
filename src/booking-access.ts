import { createHash } from "node:crypto";

type FetchLike = typeof fetch;

export type BookingAccessScope = { venueId: number; eventType: string };
export type BookingAccessTokenProvider = (scope: BookingAccessScope) => Promise<string | null>;
export type BookingAccessErrorCode =
  | "BOT_REQUEST_BLOCKED"
  | "TURNSTILE_TOKEN_REQUIRED"
  | "BOOKING_ACCESS_TOKEN_REQUIRED"
  | "POW_INVALID"
  | "HTTP_ERROR";

const BASE_URL = "https://api.outdoor.sport.mos.ru";
const SITE_URL = "https://outdoor.sport.mos.ru/#venues-events";
const SITE_ORIGIN = "https://outdoor.sport.mos.ru";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: SITE_ORIGIN,
  Referer: `${SITE_ORIGIN}/`,
  "User-Agent": BROWSER_USER_AGENT,
};

export class BookingAccessError extends Error {
  constructor(
    public readonly code: BookingAccessErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "BookingAccessError";
  }
}

function extractApiErrorCode(body: unknown): BookingAccessErrorCode | null {
  const errors = (body as { errors?: Array<{ extensions?: { code?: string } }> }).errors;
  const code = errors?.[0]?.extensions?.code;
  if (
    code === "BOT_REQUEST_BLOCKED" ||
    code === "TURNSTILE_TOKEN_REQUIRED" ||
    code === "BOOKING_ACCESS_TOKEN_REQUIRED" ||
    code === "POW_INVALID"
  ) {
    return code;
  }
  return null;
}

function apiErrorFromBody(body: unknown, status: number, fallbackMessage: string): BookingAccessError {
  const code = extractApiErrorCode(body) ?? "HTTP_ERROR";
  const message = (body as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ?? fallbackMessage;
  return new BookingAccessError(code, message, status);
}

async function fetchBookingJson<T>(fetchImpl: FetchLike, url: URL, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw apiErrorFromBody(body, response.status, `PADL booking API ${url.pathname} вернул HTTP ${response.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

function leadingZeroBits(buffer: Buffer): number {
  let bits = 0;
  for (const byte of buffer) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    for (let mask = 128; mask > 0 && (byte & mask) === 0; mask >>= 1) {
      bits += 1;
    }
    break;
  }
  return bits;
}

export async function solveProofOfWork(challenge: string, bits: number, timeoutMs: number): Promise<{ nonce: number; ms: number }> {
  const startedAt = Date.now();
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash("sha256").update(`${challenge}:${nonce}`).digest();
    if (leadingZeroBits(digest) >= bits) {
      return { nonce, ms: Date.now() - startedAt };
    }
    if (nonce % 1024 === 0 && Date.now() - startedAt > timeoutMs) {
      throw new BookingAccessError("HTTP_ERROR", "Не удалось решить PADL proof-of-work за отведенное время");
    }
  }
}

export function shouldUseBrowserFallback(error: unknown): boolean {
  return (
    error instanceof BookingAccessError &&
    (error.code === "BOT_REQUEST_BLOCKED" ||
      error.code === "TURNSTILE_TOKEN_REQUIRED" ||
      error.code === "BOOKING_ACCESS_TOKEN_REQUIRED")
  );
}

export function createHttpBookingAccessTokenProvider(input: {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  now?: () => number;
}): BookingAccessTokenProvider {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  let cached: { token: string; expiresAtMs: number; scopeKey: string } | null = null;

  return async (scope) => {
    const scopeKey = `${scope.venueId}:${scope.eventType}`;
    if (cached && cached.scopeKey === scopeKey && cached.expiresAtMs - 30_000 > now()) {
      return cached.token;
    }

    const powUrl = new URL("/booking/pow", BASE_URL);
    const pow = await fetchBookingJson<{ enabled?: boolean; challenge?: string; bits?: number }>(
      fetchImpl,
      powUrl,
      { method: "POST", headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" }, body: "{}" },
      input.timeoutMs
    );

    const body: Record<string, unknown> = {
      venue_id: scope.venueId,
      event_type: scope.eventType,
    };
    if (pow.enabled && pow.challenge) {
      const solved = await solveProofOfWork(pow.challenge, Number(pow.bits ?? 0), input.timeoutMs);
      body.pow_challenge = pow.challenge;
      body.pow_nonce = solved.nonce;
      body.pow_bits = Number(pow.bits ?? 0);
      body.pow_solve_ms = solved.ms;
    }

    const accessUrl = new URL("/booking/access", BASE_URL);
    const access = await fetchBookingJson<{ enabled?: boolean; access_token?: string; ttl_seconds?: number }>(
      fetchImpl,
      accessUrl,
      { method: "POST", headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      input.timeoutMs
    );
    if (!access.enabled) {
      cached = null;
      return null;
    }
    if (!access.access_token) {
      throw new BookingAccessError("HTTP_ERROR", "PADL booking access token не был возвращен HTTP flow");
    }

    cached = {
      token: access.access_token,
      expiresAtMs: now() + Math.max(0, Number(access.ttl_seconds ?? 0)) * 1000,
      scopeKey,
    };
    return cached.token;
  };
}

export function createBrowserBookingAccessTokenProvider(input: { timeoutMs: number }): BookingAccessTokenProvider {
  return async (scope) => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: BROWSER_USER_AGENT,
        extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8" },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(input.timeoutMs);
      await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: Math.min(input.timeoutMs, 5000) }).catch(() => undefined);

      const powResponse = await page.evaluate(async () => {
        const response = await fetch("https://api.outdoor.sport.mos.ru/booking/pow", {
          method: "POST",
          headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
          body: "{}",
          credentials: "include",
        });
        return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
      });
      if (!powResponse.ok) {
        throw apiErrorFromBody(powResponse.body, powResponse.status, "PADL browser pow flow завершился ошибкой");
      }

      const pow = powResponse.body as { enabled?: boolean; challenge?: string; bits?: number };
      const accessBody: Record<string, unknown> = {
        venue_id: scope.venueId,
        event_type: scope.eventType,
      };
      if (pow.enabled && pow.challenge) {
        const solved = await solveProofOfWork(pow.challenge, Number(pow.bits ?? 0), input.timeoutMs);
        accessBody.pow_challenge = pow.challenge;
        accessBody.pow_nonce = solved.nonce;
        accessBody.pow_bits = Number(pow.bits ?? 0);
        accessBody.pow_solve_ms = solved.ms;
      }

      const turnstileToken = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]'
        );
        return input?.value || null;
      });
      if (turnstileToken) {
        accessBody.turnstile_token = turnstileToken;
      }

      const accessResponse = await page.evaluate(async (body) => {
        const response = await fetch("https://api.outdoor.sport.mos.ru/booking/access", {
          method: "POST",
          headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
      }, accessBody);
      if (!accessResponse.ok) {
        throw apiErrorFromBody(accessResponse.body, accessResponse.status, "PADL browser access flow завершился ошибкой");
      }

      const access = accessResponse.body as { enabled?: boolean; access_token?: string };
      if (!access.enabled) {
        return null;
      }
      if (!access.access_token) {
        throw new BookingAccessError("HTTP_ERROR", "PADL booking access token не был возвращен browser flow");
      }
      return access.access_token;
    } finally {
      await browser.close();
    }
  };
}

export function createBookingAccessTokenProvider(input: {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  httpProvider?: BookingAccessTokenProvider;
  browserProvider?: BookingAccessTokenProvider;
  mode?: "auto" | "http" | "browser";
  now?: () => number;
  log?: Pick<Console, "log" | "error">;
}): BookingAccessTokenProvider {
  const now = input.now ?? Date.now;
  const mode = input.mode ?? "auto";
  const httpProvider =
    input.httpProvider ??
    createHttpBookingAccessTokenProvider(
      input.fetchImpl
        ? { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs, now }
        : { timeoutMs: input.timeoutMs, now }
    );
  const browserProvider = input.browserProvider ?? createBrowserBookingAccessTokenProvider({ timeoutMs: input.timeoutMs });
  let cached: { token: string; expiresAtMs: number; scopeKey: string } | null = null;

  async function remember(scope: BookingAccessScope, token: string | null): Promise<string | null> {
    if (token) {
      cached = {
        token,
        scopeKey: `${scope.venueId}:${scope.eventType}`,
        expiresAtMs: now() + 5 * 60 * 1000,
      };
    }
    return token;
  }

  return async (scope) => {
    const scopeKey = `${scope.venueId}:${scope.eventType}`;
    if (cached && cached.scopeKey === scopeKey && cached.expiresAtMs - 30_000 > now()) {
      return cached.token;
    }

    if (mode === "browser") {
      input.log?.log("padl-booking-access", { source: "browser", venueId: scope.venueId, eventType: scope.eventType });
      return await remember(scope, await browserProvider(scope));
    }
    if (mode === "http") {
      input.log?.log("padl-booking-access", { source: "http", venueId: scope.venueId, eventType: scope.eventType });
      return await remember(scope, await httpProvider(scope));
    }

    try {
      const token = await httpProvider(scope);
      input.log?.log("padl-booking-access", { source: "http", venueId: scope.venueId, eventType: scope.eventType });
      return await remember(scope, token);
    } catch (error) {
      if (!shouldUseBrowserFallback(error)) {
        throw error;
      }
      input.log?.log("padl-booking-access", {
        source: "browser",
        venueId: scope.venueId,
        eventType: scope.eventType,
        reason: error instanceof BookingAccessError ? error.code : "unknown",
      });
      return await remember(scope, await browserProvider(scope));
    }
  };
}
