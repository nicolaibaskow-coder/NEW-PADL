import { describe, expect, it } from "vitest";
import { normalizeAndFilterSlots } from "../src/slot-filter";
import type { PadlConfig, PadlEventCard, PadlVenue, RawAvailabilityEvent } from "../src/types";

const config: PadlConfig = {
  telegramBotToken: "123:token",
  venues: { mode: "all", values: [] },
  timeFromMinutes: 600,
  timeToMinutes: 1320,
  requiredPeople: 4,
  gameTypes: ["free_play"],
  stateSessionExternalId: "padl-telegram-bot-state",
  timezone: "Europe/Moscow",
  cron: "* * * * *",
  maxMessageLength: 3900,
  telegramGetUpdatesTimeoutSeconds: 0,
  httpTimeoutMs: 12000,
};

const venue: PadlVenue = {
  id: 12,
  title: "Ст. метро Баррикадная",
  address: null,
  workingHours: null,
  sort: 1,
};

const venueTretyakovskaya: PadlVenue = {
  id: 13,
  title: "Ст. метро Третьяковская",
  address: null,
  workingHours: null,
  sort: 2,
};

const card: PadlEventCard = {
  id: 1,
  title: "Свободная игра",
  eventType: "free_play",
  venueId: 12,
  eventIds: [147],
  sort: 1,
};

const cardTretyakovskaya: PadlEventCard = {
  id: 2,
  title: "Свободная игра",
  eventType: "free_play",
  venueId: 13,
  eventIds: [148],
  sort: 1,
};

const event: RawAvailabilityEvent = {
  id: 147,
  title: "Свободная игра",
  max_tickets_per_booking: 4,
  allowed_durations: [60],
  starts: [
    {
      starts_at: "2026-07-06T15:00:00.000Z",
      time: "18:00",
      durations: {
        "60": { available_tickets: 4, is_available: true },
        "90": { available_tickets: 3, is_available: true },
      },
    },
  ],
};

const eventTretyakovskaya: RawAvailabilityEvent = {
  ...event,
  id: 148,
};

describe("normalizeAndFilterSlots", () => {
  it("оставляет только строгое равенство available_tickets", () => {
    const slots = normalizeAndFilterSlots({ config, venues: [venue], eventCards: [card], availabilityEvents: [event] });

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ availableTickets: 4, durationMinutes: 60 });
  });

  it("включает границы времени", () => {
    const slots = normalizeAndFilterSlots({ config, venues: [venue], eventCards: [card], availabilityEvents: [event] });

    expect(slots[0]?.moscowMinutes).toBe(1080);
  });

  it("фильтрует площадки по точному id или названию", () => {
    const slots = normalizeAndFilterSlots({
      config: { ...config, venues: { mode: "list", values: ["Ст. метро Римская"] } },
      venues: [venue],
      eventCards: [card],
      availabilityEvents: [event],
    });

    expect(slots).toEqual([]);
  });

  it("фильтрует типы игр", () => {
    const slots = normalizeAndFilterSlots({
      config: { ...config, gameTypes: ["masterclass"] },
      venues: [venue],
      eventCards: [card],
      availabilityEvents: [event],
    });

    expect(slots).toEqual([]);
  });

  it("проставляет порядок площадок из PADL_VENUES", () => {
    const slots = normalizeAndFilterSlots({
      config: { ...config, venues: { mode: "list", values: ["Ст. метро Третьяковская", "12"] } },
      venues: [venue, venueTretyakovskaya],
      eventCards: [card, cardTretyakovskaya],
      availabilityEvents: [event, eventTretyakovskaya],
    });

    expect(slots.map((slot) => [slot.venueTitle, slot.venueOrder])).toEqual([
      ["Ст. метро Баррикадная", 1],
      ["Ст. метро Третьяковская", 0],
    ]);
  });
});
