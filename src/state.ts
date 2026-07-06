import { z } from "zod";
import type { BotState } from "./types";

const subscriberSchema = z.object({
  chatId: z.number().int(),
  firstSeenAt: z.string().datetime(),
  lastStartAt: z.string().datetime(),
});

const stateSchema = z.object({
  telegramOffset: z.number().int().nonnegative().nullable().default(null),
  subscribers: z.record(z.string(), subscriberSchema).default({}),
});

export function createEmptyState(): BotState {
  return { telegramOffset: null, subscribers: {} };
}

export function parseBotState(metadata: unknown): BotState {
  if (metadata === null || metadata === undefined) {
    return createEmptyState();
  }
  const parsed = stateSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new Error(`Некорректная Trigger.dev session metadata: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function addStartSubscriber(state: BotState, chatId: number, nowIso: string): BotState {
  const key = String(chatId);
  const existing = state.subscribers[key];
  return {
    ...state,
    subscribers: {
      ...state.subscribers,
      [key]: {
        chatId,
        firstSeenAt: existing?.firstSeenAt ?? nowIso,
        lastStartAt: nowIso,
      },
    },
  };
}

export function removeSubscriber(state: BotState, chatId: number): BotState {
  const nextSubscribers = { ...state.subscribers };
  delete nextSubscribers[String(chatId)];
  return { ...state, subscribers: nextSubscribers };
}

export function setTelegramOffset(state: BotState, telegramOffset: number | null): BotState {
  return { ...state, telegramOffset };
}
