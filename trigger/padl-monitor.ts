import { logger, schedules } from "@trigger.dev/sdk";
import { createBookingAccessTokenProvider } from "../src/booking-access";
import { loadConfig } from "../src/config";
import { createPadlApiClient } from "../src/padl-api";
import { runPadlMonitorOnce } from "../src/padl-monitor-run";
import { createSessionStateStore } from "../src/state-store";
import { createTelegramClient } from "../src/telegram";
import { padlMonitorQueue } from "./queues";

const config = loadConfig();

export const padlMonitor = schedules.task({
  id: "padl-monitor",
  queue: padlMonitorQueue,
  cron: {
    pattern: config.cron,
    timezone: config.timezone,
  },
  run: async () => {
    await runPadlMonitorOnce({
      config,
      stateStore: createSessionStateStore({ externalId: config.stateSessionExternalId }),
      telegram: createTelegramClient({
        token: config.telegramBotToken,
        timeoutMs: config.httpTimeoutMs,
      }),
      padl: createPadlApiClient({
        timeoutMs: config.httpTimeoutMs,
        bookingAccessTokenProvider: createBookingAccessTokenProvider({
          timeoutMs: config.httpTimeoutMs,
          log: logger,
        }),
      }),
      log: logger,
    });
  },
});
