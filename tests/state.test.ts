import { describe, expect, it } from "vitest";
import {
  addStartSubscriber,
  createEmptyState,
  parseBotState,
  removeSubscriber,
  setTelegramOffset,
} from "../src/state";

describe("state", () => {
  it("создает пустое состояние", () => {
    expect(createEmptyState()).toEqual({ telegramOffset: null, subscribers: {} });
  });

  it("добавляет нового подписчика", () => {
    const state = addStartSubscriber(createEmptyState(), 111, "2026-07-06T12:00:00.000Z");

    expect(state.subscribers["111"]).toEqual({
      chatId: 111,
      firstSeenAt: "2026-07-06T12:00:00.000Z",
      lastStartAt: "2026-07-06T12:00:00.000Z",
    });
  });

  it("повторный /start не дублирует подписчика и обновляет lastStartAt", () => {
    const once = addStartSubscriber(createEmptyState(), 111, "2026-07-06T12:00:00.000Z");
    const twice = addStartSubscriber(once, 111, "2026-07-06T12:05:00.000Z");

    expect(Object.keys(twice.subscribers)).toEqual(["111"]);
    expect(twice.subscribers["111"]?.firstSeenAt).toBe("2026-07-06T12:00:00.000Z");
    expect(twice.subscribers["111"]?.lastStartAt).toBe("2026-07-06T12:05:00.000Z");
  });

  it("удаляет заблокированного подписчика", () => {
    const state = addStartSubscriber(createEmptyState(), 111, "2026-07-06T12:00:00.000Z");

    expect(removeSubscriber(state, 111).subscribers).toEqual({});
  });

  it("сохраняет offset", () => {
    expect(setTelegramOffset(createEmptyState(), 123).telegramOffset).toBe(123);
  });

  it("нормализует пустую metadata", () => {
    expect(parseBotState(null)).toEqual(createEmptyState());
  });
});
