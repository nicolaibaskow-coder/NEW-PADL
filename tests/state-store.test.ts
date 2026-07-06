import { describe, expect, it, vi } from "vitest";
import { createSessionStateStore } from "../src/state-store";

describe("createSessionStateStore", () => {
  it("читает metadata существующей session", async () => {
    const sessionsApi = {
      retrieve: vi.fn().mockResolvedValue({ metadata: { telegramOffset: 10, subscribers: {} } }),
      start: vi.fn(),
      update: vi.fn(),
    };
    const store = createSessionStateStore({ sessionsApi, externalId: "padl-telegram-bot-state" });

    await expect(store.load()).resolves.toEqual({ telegramOffset: 10, subscribers: {} });
    expect(sessionsApi.start).not.toHaveBeenCalled();
  });

  it("lazy-create session при 404", async () => {
    const notFound = Object.assign(new Error("not found"), { status: 404 });
    const sessionsApi = {
      retrieve: vi.fn().mockRejectedValueOnce(notFound).mockResolvedValueOnce({ metadata: null }),
      start: vi.fn().mockResolvedValue({ id: "session_123" }),
      update: vi.fn(),
    };
    const store = createSessionStateStore({ sessionsApi, externalId: "padl-telegram-bot-state" });

    await expect(store.load()).resolves.toEqual({ telegramOffset: null, subscribers: {} });
    expect(sessionsApi.start).toHaveBeenCalledWith(
      expect.objectContaining({
        type: "padl.telegram-state",
        externalId: "padl-telegram-bot-state",
        taskIdentifier: "padl-state-session",
      })
    );
  });

  it("сохраняет metadata целиком", async () => {
    const sessionsApi = { retrieve: vi.fn(), start: vi.fn(), update: vi.fn().mockResolvedValue({}) };
    const store = createSessionStateStore({ sessionsApi, externalId: "padl-telegram-bot-state" });

    await store.save({ telegramOffset: 20, subscribers: {} });

    expect(sessionsApi.update).toHaveBeenCalledWith("padl-telegram-bot-state", {
      metadata: { telegramOffset: 20, subscribers: {} },
    });
  });
});
