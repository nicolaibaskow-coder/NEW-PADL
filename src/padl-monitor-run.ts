import { formatSlotMessages } from "./message-format";
import { normalizeAndFilterSlots } from "./slot-filter";
import { addStartSubscriber, removeSubscriber, setTelegramOffset } from "./state";
import { classifySendError, extractStartChatIds, nextTelegramOffset } from "./telegram";
import type { BotState, PadlConfig, PadlEventCard, PadlVenue, RawAvailabilityEvent } from "./types";

type StateStore = {
  load(): Promise<BotState>;
  save(state: BotState): Promise<void>;
};

type Telegram = {
  getUpdates(input: { offset: number | null; timeoutSeconds: 0 }): Promise<Parameters<typeof extractStartChatIds>[0]>;
  sendMessage(input: { chatId: number; text: string }): Promise<void>;
};

type Padl = {
  getVenues(): Promise<PadlVenue[]>;
  getEventCards(): Promise<PadlEventCard[]>;
  getDateOptions(input: { venueId: number; eventType: string }): Promise<unknown>;
  getAvailability(input: { venueId: number; eventType: string; courtId: number; date: string }): Promise<RawAvailabilityEvent[]>;
};

function venueMatches(config: PadlConfig, venue: PadlVenue): boolean {
  if (config.venues.mode === "all") {
    return true;
  }
  return config.venues.values.some((value) => value === String(venue.id) || value === venue.title);
}

function extractCourtDates(dateOptions: unknown): Array<{ courtId: number; date: string }> {
  const body = dateOptions as { courts?: Array<{ id?: number; dates?: Array<{ date?: string; disabled?: boolean }> }> };
  const result: Array<{ courtId: number; date: string }> = [];
  for (const court of body.courts ?? []) {
    const courtId = court.id;
    if (typeof courtId !== "number" || !Number.isInteger(courtId)) continue;
    for (const date of court.dates ?? []) {
      if (typeof date.date === "string" && date.disabled !== true) {
        result.push({ courtId, date: date.date });
      }
    }
  }
  return result;
}

async function collectAvailability(input: {
  padl: Padl;
  config: PadlConfig;
  venues: PadlVenue[];
  eventCards: PadlEventCard[];
}): Promise<RawAvailabilityEvent[]> {
  const chunks: RawAvailabilityEvent[][] = [];
  const uniquePairs = new Map<string, { venueId: number; eventType: string }>();
  const venuesById = new Map(input.venues.map((venue) => [venue.id, venue]));

  for (const card of input.eventCards) {
    const venue = venuesById.get(card.venueId);
    if (!venue || !venueMatches(input.config, venue) || !input.config.gameTypes.includes(card.eventType)) {
      continue;
    }
    uniquePairs.set(`${card.venueId}:${card.eventType}`, { venueId: card.venueId, eventType: card.eventType });
  }

  for (const pair of uniquePairs.values()) {
    const dateOptions = await input.padl.getDateOptions(pair);
    for (const option of extractCourtDates(dateOptions)) {
      chunks.push(
        await input.padl.getAvailability({
          venueId: pair.venueId,
          eventType: pair.eventType,
          courtId: option.courtId,
          date: option.date,
        })
      );
    }
  }

  return chunks.flat();
}

export async function runPadlMonitorOnce(input: {
  config: PadlConfig;
  stateStore: StateStore;
  telegram: Telegram;
  padl: Padl;
  now?: () => string;
  log?: Pick<Console, "log" | "error">;
}): Promise<void> {
  const log = input.log ?? console;
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let state = await input.stateStore.load();

  const updates = await input.telegram.getUpdates({
    offset: state.telegramOffset,
    timeoutSeconds: input.config.telegramGetUpdatesTimeoutSeconds,
  });
  for (const chatId of extractStartChatIds(updates)) {
    state = addStartSubscriber(state, chatId, input.now?.() ?? new Date().toISOString());
  }
  state = setTelegramOffset(state, nextTelegramOffset(updates, state.telegramOffset));

  let messages: string[];
  let slotsFound = 0;
  let slotSearchMs = 0;
  const slotSearchStartedAt = Date.now();
  try {
    const [venues, eventCards] = await Promise.all([input.padl.getVenues(), input.padl.getEventCards()]);
    const availabilityEvents = await collectAvailability({
      padl: input.padl,
      config: input.config,
      venues,
      eventCards,
    });
    const slots = normalizeAndFilterSlots({ config: input.config, venues, eventCards, availabilityEvents });
    slotsFound = slots.length;
    messages = formatSlotMessages(slots, input.config.maxMessageLength);
    slotSearchMs = Date.now() - slotSearchStartedAt;
    log.log("padl-monitor slots", { slots: slotsFound, slotSearchMs });
  } catch (error) {
    slotSearchMs = Date.now() - slotSearchStartedAt;
    log.error("padl-monitor slot fetch failed", error);
    messages = ["Не удалось проверить слоты. Попробую снова через минуту."];
  }

  let sentMessages = 0;
  const sendStartedAt = Date.now();
  for (const subscriber of Object.values(state.subscribers)) {
    for (const text of messages) {
      try {
        await input.telegram.sendMessage({ chatId: subscriber.chatId, text });
        sentMessages += 1;
      } catch (error) {
        log.error("padl-monitor telegram send failed", { chatId: subscriber.chatId, error });
        if (classifySendError(error) === "remove-subscriber") {
          state = removeSubscriber(state, subscriber.chatId);
          break;
        }
      }
    }
  }
  const sendMs = Date.now() - sendStartedAt;

  await input.stateStore.save(state);
  const finishedAtMs = Date.now();
  log.log("padl-monitor completed", {
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    subscribers: Object.keys(state.subscribers).length,
    slotsFound,
    sentMessages,
    slotSearchMs,
    sendMs,
    durationMs: finishedAtMs - startedAtMs,
  });
}
