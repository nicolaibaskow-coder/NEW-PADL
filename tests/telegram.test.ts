import { describe, expect, it, vi } from "vitest";
import {
  classifySendError,
  createTelegramClient,
  extractStartChatIds,
  nextTelegramOffset,
} from "../src/telegram";

describe("telegram", () => {
  it("извлекает /start и /start payload", () => {
    const updates = [
      { update_id: 10, message: { text: "/start", chat: { id: 111 } } },
      { update_id: 11, message: { text: "/start abc", chat: { id: 222 } } },
      { update_id: 12, message: { text: "hello", chat: { id: 333 } } },
      { update_id: 13 },
    ];

    expect(extractStartChatIds(updates)).toEqual([111, 222]);
  });

  it("считает следующий offset", () => {
    expect(nextTelegramOffset([{ update_id: 10 }, { update_id: 12 }], 5)).toBe(13);
    expect(nextTelegramOffset([], 5)).toBe(5);
    expect(nextTelegramOffset([], null)).toBeNull();
  });

  it("классифицирует блокировку и недоступный чат как удаление подписчика", () => {
    expect(classifySendError({ error_code: 403, description: "Forbidden: bot was blocked by the user" })).toBe(
      "remove-subscriber"
    );
    expect(classifySendError({ error_code: 400, description: "Bad Request: chat not found" })).toBe(
      "remove-subscriber"
    );
  });

  it("вызывает getUpdates с timeout 0 и allowed_updates message", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, result: [] }),
    });
    const client = createTelegramClient({ token: "123:token", fetchImpl: fetchMock, timeoutMs: 1000 });

    await client.getUpdates({ offset: 42, timeoutSeconds: 0 });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/bot123:token/getUpdates");
    expect(url.searchParams.get("offset")).toBe("42");
    expect(url.searchParams.get("timeout")).toBe("0");
    expect(url.searchParams.get("allowed_updates")).toBe("[\"message\"]");
  });
});
