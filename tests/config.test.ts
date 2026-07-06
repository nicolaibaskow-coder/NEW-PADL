import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const baseEnv = {
  TELEGRAM_BOT_TOKEN: "123:token",
  PADL_VENUES: "all",
  PADL_TIME_FROM: "10:00",
  PADL_TIME_TO: "22:00",
  PADL_REQUIRED_PEOPLE: "4",
  PADL_GAME_TYPES: "free_play,masterclass",
  PADL_STATE_SESSION_EXTERNAL_ID: "padl-telegram-bot-state",
  PADL_TIMEZONE: "Europe/Moscow",
  PADL_CRON: "* * * * *",
  PADL_MAX_MESSAGE_LENGTH: "3900",
  TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS: "0",
  PADL_HTTP_TIMEOUT_MS: "12000",
};

describe("loadConfig", () => {
  it("читает корректные значения", () => {
    expect(loadConfig(baseEnv)).toMatchObject({
      telegramBotToken: "123:token",
      venues: { mode: "all", values: [] },
      timeFromMinutes: 600,
      timeToMinutes: 1320,
      requiredPeople: 4,
      gameTypes: ["free_play", "masterclass"],
      timezone: "Europe/Moscow",
      telegramGetUpdatesTimeoutSeconds: 0,
    });
  });

  it("читает список площадок в заданном порядке", () => {
    const config = loadConfig({ ...baseEnv, PADL_VENUES: "12,Ст. метро Римская" });

    expect(config.venues).toEqual({ mode: "list", values: ["12", "Ст. метро Римская"] });
  });

  it("отклоняет неверное время", () => {
    expect(() => loadConfig({ ...baseEnv, PADL_TIME_FROM: "25:00" })).toThrow("PADL_TIME_FROM");
  });

  it("отклоняет неверное количество людей", () => {
    expect(() => loadConfig({ ...baseEnv, PADL_REQUIRED_PEOPLE: "0" })).toThrow("PADL_REQUIRED_PEOPLE");
  });

  it("запрещает production long polling", () => {
    expect(() => loadConfig({ ...baseEnv, TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS: "30" })).toThrow(
      "TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS должен быть 0"
    );
  });
});
