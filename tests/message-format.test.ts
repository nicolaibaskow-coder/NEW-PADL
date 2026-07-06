import { describe, expect, it } from "vitest";
import { formatSlotMessages } from "../src/message-format";
import type { NormalizedSlot } from "../src/types";

const slot = (overrides: Partial<NormalizedSlot>): NormalizedSlot => ({
  venueId: 12,
  venueTitle: "Ст. метро Баррикадная",
  venueOrder: 1,
  venueSort: 1,
  eventType: "free_play",
  eventTitle: "Свободная игра",
  eventId: 147,
  startsAt: "2026-07-06T15:00:00.000Z",
  moscowDateLabel: "06.07",
  moscowTimeLabel: "18:00",
  moscowMinutes: 1080,
  durationMinutes: 60,
  availableTickets: 4,
  ...overrides,
});

describe("formatSlotMessages", () => {
  it("возвращает сообщение для пустого списка", () => {
    expect(formatSlotMessages([], 3900)).toEqual(["Свободных слотов сейчас нет"]);
  });

  it("группирует по площадкам и сортирует слоты", () => {
    const messages = formatSlotMessages(
      [
        slot({ startsAt: "2026-07-06T16:00:00.000Z", moscowTimeLabel: "19:00" }),
        slot({ venueId: 13, venueTitle: "Ст. метро Третьяковская", venueOrder: 2, venueSort: 2, moscowTimeLabel: "20:00" }),
      ],
      3900
    );

    expect(messages[0]).toBe(
      [
        "Ст. метро Баррикадная",
        "06.07 19:00 — 4 чел. — Свободная игра",
        "",
        "Ст. метро Третьяковская",
        "06.07 20:00 — 4 чел. — Свободная игра",
      ].join("\n")
    );
  });

  it("сортирует площадки по порядку PADL_VENUES, подготовленному slot-filter", () => {
    const messages = formatSlotMessages(
      [
        slot({ venueId: 12, venueTitle: "Ст. метро Баррикадная", venueOrder: 1, venueSort: 1 }),
        slot({ venueId: 13, venueTitle: "Ст. метро Третьяковская", venueOrder: 0, venueSort: 2 }),
      ],
      3900
    );

    expect(messages[0]?.startsWith("Ст. метро Третьяковская")).toBe(true);
  });

  it("делит длинное сообщение без разрыва строки слота", () => {
    const messages = formatSlotMessages(
      [
        slot({ moscowTimeLabel: "18:00" }),
        slot({ moscowTimeLabel: "19:00" }),
        slot({ moscowTimeLabel: "20:00" }),
      ],
      80
    );

    expect(messages.length).toBeGreaterThan(1);
    expect(messages.every((message) => message.length <= 80)).toBe(true);
  });
});
