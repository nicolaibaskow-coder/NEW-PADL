import { describe, expect, it, vi } from "vitest";
import {
  BookingAccessError,
  createBookingAccessTokenProvider,
  createHttpBookingAccessTokenProvider,
} from "../src/booking-access";

describe("booking-access", () => {
  it("получает token через HTTP PoW flow с браузерными заголовками", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: true, challenge: "abc", bits: 0 }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ enabled: true, access_token: "booking-token", ttl_seconds: 60 }),
      });
    const provider = createHttpBookingAccessTokenProvider({ fetchImpl: fetchMock, timeoutMs: 1000 });

    await expect(provider({ venueId: 12, eventType: "free_play" })).resolves.toBe("booking-token");

    expect(String(fetchMock.mock.calls[0]?.[0])).toBe("https://api.outdoor.sport.mos.ru/booking/pow");
    expect(fetchMock.mock.calls[0]?.[1]?.headers).toMatchObject({
      Origin: "https://outdoor.sport.mos.ru",
      Referer: "https://outdoor.sport.mos.ru/",
    });
    expect(String(fetchMock.mock.calls[1]?.[0])).toBe("https://api.outdoor.sport.mos.ru/booking/access");
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({
      venue_id: 12,
      event_type: "free_play",
      pow_challenge: "abc",
      pow_bits: 0,
    });
  });

  it("переключается на browser fallback при Turnstile", async () => {
    const httpProvider = vi
      .fn()
      .mockRejectedValue(new BookingAccessError("TURNSTILE_TOKEN_REQUIRED", "turnstile_token is required", 400));
    const browserProvider = vi.fn().mockResolvedValue("browser-token");
    const provider = createBookingAccessTokenProvider({
      httpProvider,
      browserProvider,
      timeoutMs: 1000,
      now: () => 1_000_000,
    });

    await expect(provider({ venueId: 12, eventType: "free_play" })).resolves.toBe("browser-token");
    expect(browserProvider).toHaveBeenCalledWith({ venueId: 12, eventType: "free_play" });
  });
});
