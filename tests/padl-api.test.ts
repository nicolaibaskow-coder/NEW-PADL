import { describe, expect, it, vi } from "vitest";
import { createPadlApiClient } from "../src/padl-api";

describe("padl-api", () => {
  it("читает опубликованные площадки", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 12, title: "Ст. метро Баррикадная", address: "ул. Баррикадная", working_hours: "<p>10-22</p>", sort: 1 }],
      }),
    });
    const client = createPadlApiClient({ fetchImpl: fetchMock, timeoutMs: 1000 });

    await expect(client.getVenues()).resolves.toEqual([
      { id: 12, title: "Ст. метро Баррикадная", address: "ул. Баррикадная", workingHours: "<p>10-22</p>", sort: 1 },
    ]);

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/items/venues");
    expect(url.searchParams.get("filter[status][_eq]")).toBe("published");
  });

  it("читает event_cards с events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        data: [{ id: 1, title: "Свободная игра", event_type: "free_play", venue_id: 12, events: [147, 148], sort: 1 }],
      }),
    });
    const client = createPadlApiClient({ fetchImpl: fetchMock, timeoutMs: 1000 });

    await expect(client.getEventCards()).resolves.toEqual([
      { id: 1, title: "Свободная игра", eventType: "free_play", venueId: 12, eventIds: [147, 148], sort: 1 },
    ]);
  });

  it("передает X-Booking-Access-Token при наличии токена", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ courts: [] }) });
    const bookingAccessTokenProvider = vi.fn().mockResolvedValue("booking-token");
    const client = createPadlApiClient({
      fetchImpl: fetchMock,
      timeoutMs: 1000,
      bookingAccessTokenProvider,
    });

    await client.getDateOptions({ venueId: 12, eventType: "free_play" });

    expect(bookingAccessTokenProvider).toHaveBeenCalledWith({ venueId: 12, eventType: "free_play" });
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      "X-Booking-Access-Token": "booking-token",
      Origin: "https://outdoor.sport.mos.ru",
      Referer: "https://outdoor.sport.mos.ru/",
    });
  });

  it("читает availability events", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ events: [{ id: 147, title: "Свободная игра", starts: [] }] }),
    });
    const client = createPadlApiClient({
      fetchImpl: fetchMock,
      timeoutMs: 1000,
      bookingAccessTokenProvider: async () => "booking-token",
    });

    await expect(
      client.getAvailability({ venueId: 12, eventType: "free_play", courtId: 7, date: "2026-07-06" })
    ).resolves.toEqual([{ id: 147, title: "Свободная игра", starts: [] }]);
  });
});
