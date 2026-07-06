import { describe, expect, it, vi } from "vitest";
import { runPadlMonitorOnce } from "../src/padl-monitor-run";
import type { PadlConfig } from "../src/types";

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

describe("runPadlMonitorOnce", () => {
  it("обрабатывает /start, отправляет текущее состояние и сохраняет offset", async () => {
    const stateStore = {
      load: vi.fn().mockResolvedValue({ telegramOffset: null, subscribers: {} }),
      save: vi.fn(),
    };
    const telegram = {
      getUpdates: vi.fn().mockResolvedValue([{ update_id: 10, message: { text: "/start", chat: { id: 111 } } }]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    const padl = {
      getVenues: vi.fn().mockResolvedValue([{ id: 12, title: "Ст. метро Баррикадная", address: null, workingHours: null, sort: 1 }]),
      getEventCards: vi.fn().mockResolvedValue([{ id: 1, title: "Свободная игра", eventType: "free_play", venueId: 12, eventIds: [147], sort: 1 }]),
      getDateOptions: vi.fn().mockResolvedValue({ courts: [] }),
      getAvailability: vi.fn().mockResolvedValue([]),
    };
    const log = { log: vi.fn(), error: vi.fn() };

    await runPadlMonitorOnce({ config, stateStore, telegram, padl, now: () => "2026-07-06T12:00:00.000Z", log });

    expect(telegram.getUpdates).toHaveBeenCalledWith({ offset: null, timeoutSeconds: 0 });
    expect(telegram.sendMessage).toHaveBeenCalledWith({ chatId: 111, text: "Свободных слотов сейчас нет" });
    expect(stateStore.save).toHaveBeenCalledWith({
      telegramOffset: 11,
      subscribers: {
        "111": {
          chatId: 111,
          firstSeenAt: "2026-07-06T12:00:00.000Z",
          lastStartAt: "2026-07-06T12:00:00.000Z",
        },
      },
    });
    expect(log.log).toHaveBeenCalledWith(
      "padl-monitor completed",
      expect.objectContaining({
        subscribers: 1,
        slotsFound: 0,
        sentMessages: 1,
        slotSearchMs: expect.any(Number),
        sendMs: expect.any(Number),
        durationMs: expect.any(Number),
        startedAt: expect.any(String),
        finishedAt: expect.any(String),
      })
    );
  });

  it("ошибка получения слотов не удаляет подписчиков и отправляет короткую ошибку", async () => {
    const stateStore = {
      load: vi.fn().mockResolvedValue({
        telegramOffset: 5,
        subscribers: { "111": { chatId: 111, firstSeenAt: "2026-07-06T12:00:00.000Z", lastStartAt: "2026-07-06T12:00:00.000Z" } },
      }),
      save: vi.fn(),
    };
    const telegram = {
      getUpdates: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    const padl = {
      getVenues: vi.fn().mockRejectedValue(new Error("PADL unavailable")),
      getEventCards: vi.fn(),
      getDateOptions: vi.fn(),
      getAvailability: vi.fn(),
    };

    await runPadlMonitorOnce({ config, stateStore, telegram, padl, now: () => "2026-07-06T12:00:00.000Z" });

    expect(telegram.sendMessage).toHaveBeenCalledWith({
      chatId: 111,
      text: "Не удалось проверить слоты. Попробую снова через минуту.",
    });
    expect(stateStore.save.mock.calls[0]?.[0].subscribers["111"]).toBeDefined();
  });

  it("запрашивает availability для доступных court/date и отправляет найденный слот", async () => {
    const stateStore = {
      load: vi.fn().mockResolvedValue({
        telegramOffset: null,
        subscribers: { "111": { chatId: 111, firstSeenAt: "2026-07-06T12:00:00.000Z", lastStartAt: "2026-07-06T12:00:00.000Z" } },
      }),
      save: vi.fn(),
    };
    const telegram = {
      getUpdates: vi.fn().mockResolvedValue([]),
      sendMessage: vi.fn().mockResolvedValue(undefined),
    };
    const padl = {
      getVenues: vi.fn().mockResolvedValue([{ id: 12, title: "Ст. метро Баррикадная", address: null, workingHours: null, sort: 1 }]),
      getEventCards: vi.fn().mockResolvedValue([{ id: 1, title: "Свободная игра", eventType: "free_play", venueId: 12, eventIds: [147], sort: 1 }]),
      getDateOptions: vi.fn().mockResolvedValue({
        courts: [{ id: 7, title: "Корт 1", dates: [{ date: "2026-07-06", disabled: false }] }],
      }),
      getAvailability: vi.fn().mockResolvedValue([
        {
          id: 147,
          title: "Свободная игра",
          starts: [{ starts_at: "2026-07-06T15:00:00.000Z", durations: { "60": { available_tickets: 4, is_available: true } } }],
        },
      ]),
    };

    await runPadlMonitorOnce({ config, stateStore, telegram, padl, now: () => "2026-07-06T12:00:00.000Z" });

    expect(padl.getDateOptions).toHaveBeenCalledWith({ venueId: 12, eventType: "free_play" });
    expect(padl.getAvailability).toHaveBeenCalledWith({
      venueId: 12,
      eventType: "free_play",
      courtId: 7,
      date: "2026-07-06",
    });
    expect(telegram.sendMessage.mock.calls[0]?.[0].text).toContain("06.07 18:00 — 4 чел. — Свободная игра");
  });
});
