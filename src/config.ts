import { z } from "zod";
import type { PadlConfig, VenueFilter } from "./types";

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  PADL_VENUES: z.string().min(1),
  PADL_TIME_FROM: z.string().regex(HH_MM_RE),
  PADL_TIME_TO: z.string().regex(HH_MM_RE),
  PADL_REQUIRED_PEOPLE: z.coerce.number().int().positive(),
  PADL_GAME_TYPES: z.string().min(1),
  PADL_STATE_SESSION_EXTERNAL_ID: z.string().min(1).default("padl-telegram-bot-state"),
  PADL_TIMEZONE: z.literal("Europe/Moscow").default("Europe/Moscow"),
  PADL_CRON: z.string().min(1).default("* * * * *"),
  PADL_MAX_MESSAGE_LENGTH: z.coerce.number().int().min(100).max(4096).default(3900),
  TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS: z.coerce.number().int().min(0).default(0),
  PADL_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(12000),
});

function parseTime(value: string): number {
  const match = HH_MM_RE.exec(value);
  if (!match) {
    throw new Error(`Некорректное время: ${value}`);
  }
  const [, hours = "0", minutes = "0"] = match;
  return Number(hours) * 60 + Number(minutes);
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseVenues(value: string): VenueFilter {
  if (value.trim().toLowerCase() === "all") {
    return { mode: "all", values: [] };
  }
  const values = parseList(value);
  if (values.length === 0) {
    throw new Error("PADL_VENUES должен быть all или непустым списком");
  }
  return { mode: "list", values };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PadlConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "unknown";
    const message = first?.message ?? parsed.error.message;
    throw new Error(`Некорректная env-переменная ${path}: ${message}`);
  }

  if (parsed.data.TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS !== 0) {
    throw new Error("TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS должен быть 0 в production-конфигурации");
  }

  return {
    telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
    venues: parseVenues(parsed.data.PADL_VENUES),
    timeFromMinutes: parseTime(parsed.data.PADL_TIME_FROM),
    timeToMinutes: parseTime(parsed.data.PADL_TIME_TO),
    requiredPeople: parsed.data.PADL_REQUIRED_PEOPLE,
    gameTypes: parseList(parsed.data.PADL_GAME_TYPES),
    stateSessionExternalId: parsed.data.PADL_STATE_SESSION_EXTERNAL_ID,
    timezone: parsed.data.PADL_TIMEZONE,
    cron: parsed.data.PADL_CRON,
    maxMessageLength: parsed.data.PADL_MAX_MESSAGE_LENGTH,
    telegramGetUpdatesTimeoutSeconds: 0,
    httpTimeoutMs: parsed.data.PADL_HTTP_TIMEOUT_MS,
  };
}
