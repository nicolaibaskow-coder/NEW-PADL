import type { PadlEventCard, PadlVenue, RawAvailabilityEvent } from "./types";

type FetchLike = typeof fetch;
type BookingAccessTokenProvider = (scope: { venueId: number; eventType: string }) => Promise<string | null>;

const BASE_URL = "https://api.outdoor.sport.mos.ru";
const SITE_ORIGIN = "https://outdoor.sport.mos.ru";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PADL_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: SITE_ORIGIN,
  Referer: `${SITE_ORIGIN}/`,
  "User-Agent": BROWSER_USER_AGENT,
};

async function fetchJson<T>(fetchImpl: FetchLike, url: URL, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`PADL API ${url.pathname} вернул HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function dataArray<T>(body: { data?: T[] }): T[] {
  return Array.isArray(body.data) ? body.data : [];
}

function bookingHeaders(token: string | null): Record<string, string> {
  return token ? { ...PADL_HEADERS, "X-Booking-Access-Token": token } : PADL_HEADERS;
}

export function createPadlApiClient(input: {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  bookingAccessTokenProvider?: BookingAccessTokenProvider;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const getToken = input.bookingAccessTokenProvider ?? (async () => null);

  return {
    async getVenues(): Promise<PadlVenue[]> {
      const url = new URL("/items/venues", BASE_URL);
      url.searchParams.set("filter[status][_eq]", "published");
      url.searchParams.set("sort", "sort");
      url.searchParams.set("fields", "id,title,address,working_hours,sort,status");
      const body = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
        fetchImpl,
        url,
        { headers: PADL_HEADERS },
        input.timeoutMs
      );
      return dataArray(body).map((item) => ({
        id: Number(item.id),
        title: String(item.title),
        address: item.address === null || item.address === undefined ? null : String(item.address),
        workingHours: item.working_hours === null || item.working_hours === undefined ? null : String(item.working_hours),
        sort: item.sort === null || item.sort === undefined ? null : Number(item.sort),
      }));
    },
    async getEventCards(): Promise<PadlEventCard[]> {
      const url = new URL("/items/event_cards", BASE_URL);
      url.searchParams.set("sort", "sort,id");
      url.searchParams.set("fields", "id,sort,title,description,ms_night,event_type,venue_id,events");
      url.searchParams.set("deep[events][_limit]", "-1");
      const body = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
        fetchImpl,
        url,
        { headers: PADL_HEADERS },
        input.timeoutMs
      );
      return dataArray(body).map((item) => ({
        id: Number(item.id),
        title: String(item.title),
        eventType: String(item.event_type),
        venueId: Number(item.venue_id),
        eventIds: Array.isArray(item.events) ? item.events.map(Number).filter(Number.isFinite) : [],
        sort: item.sort === null || item.sort === undefined ? null : Number(item.sort),
      }));
    },
    async getDateOptions(inputScope: { venueId: number; eventType: string }) {
      const url = new URL("/booking/date-options", BASE_URL);
      url.searchParams.set("venue_id", String(inputScope.venueId));
      url.searchParams.set("event_type", inputScope.eventType);
      const token = await getToken(inputScope);
      return await fetchJson<Record<string, unknown>>(
        fetchImpl,
        url,
        { headers: bookingHeaders(token) },
        input.timeoutMs
      );
    },
    async getAvailability(inputScope: { venueId: number; eventType: string; courtId: number; date: string }) {
      const url = new URL("/booking/availability", BASE_URL);
      url.searchParams.set("venue_id", String(inputScope.venueId));
      url.searchParams.set("event_type", inputScope.eventType);
      url.searchParams.set("court_id", String(inputScope.courtId));
      url.searchParams.set("date", inputScope.date);
      const token = await getToken(inputScope);
      const body = await fetchJson<{ events?: RawAvailabilityEvent[] }>(
        fetchImpl,
        url,
        { headers: bookingHeaders(token) },
        input.timeoutMs
      );
      return Array.isArray(body.events) ? body.events : [];
    },
  };
}
