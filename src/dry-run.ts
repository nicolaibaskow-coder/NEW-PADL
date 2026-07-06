import { loadConfig } from "./config";
import { runPadlMonitorOnce } from "./padl-monitor-run";

const config = loadConfig({
  TELEGRAM_BOT_TOKEN: "123:token",
  PADL_VENUES: "all",
  PADL_TIME_FROM: "10:00",
  PADL_TIME_TO: "22:00",
  PADL_REQUIRED_PEOPLE: "4",
  PADL_GAME_TYPES: "free_play",
  PADL_STATE_SESSION_EXTERNAL_ID: "padl-telegram-bot-state",
  PADL_TIMEZONE: "Europe/Moscow",
  PADL_CRON: "* * * * *",
  PADL_MAX_MESSAGE_LENGTH: "3900",
  TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS: "0",
  PADL_HTTP_TIMEOUT_MS: "12000",
});

await runPadlMonitorOnce({
  config,
  now: () => "2026-07-06T12:00:00.000Z",
  stateStore: {
    async load() {
      return {
        telegramOffset: null,
        subscribers: {
          "111": {
            chatId: 111,
            firstSeenAt: "2026-07-06T12:00:00.000Z",
            lastStartAt: "2026-07-06T12:00:00.000Z",
          },
        },
      };
    },
    async save(state) {
      console.log("saved state", state);
    },
  },
  telegram: {
    async getUpdates() {
      return [];
    },
    async sendMessage(message) {
      console.log("telegram message", message);
    },
  },
  padl: {
    async getVenues() {
      return [{ id: 12, title: "Ст. метро Баррикадная", address: null, workingHours: null, sort: 1 }];
    },
    async getEventCards() {
      return [{ id: 1, title: "Свободная игра", eventType: "free_play", venueId: 12, eventIds: [147], sort: 1 }];
    },
    async getDateOptions() {
      return { courts: [{ id: 7, dates: [{ date: "2026-07-06", disabled: false }] }] };
    },
    async getAvailability() {
      return [
        {
          id: 147,
          title: "Свободная игра",
          starts: [
            { starts_at: "2026-07-06T15:00:00.000Z", durations: { "60": { available_tickets: 4, is_available: true } } },
          ],
        },
      ];
    },
  },
});
