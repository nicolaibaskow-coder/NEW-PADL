# План реализации PADL Telegram Bot

> **Для агентных исполнителей:** REQUIRED SUB-SKILL: используйте `superpowers:subagent-driven-development` (рекомендуется) или `superpowers:executing-plans`, чтобы реализовать этот план по задачам. Шаги используют синтаксис checkbox (`- [ ]`) для отслеживания выполнения.

**Цель:** создать TypeScript-проект для Trigger.dev, который раз в минуту делает одну короткую проверку свободных слотов ПАДЛ, рассылает текущее состояние всем Telegram-подписчикам и завершает run.

**Архитектура:** проект делится на чистые модули `config`, `state`, `telegram`, `booking-access`, `padl-api`, `slot-filter`, `message-format` и оркестратор одного run. Trigger.dev используется только на границе: scheduled task запускает оркестратор, Trigger Sessions API хранит `telegramOffset` и подписчиков, а Playwright build extension устанавливает браузер только для PADL booking fallback. Доступ к PADL booking API закрыт адаптером `booking-access`: сначала быстрый HTTP flow, затем headless browser fallback при `BOT_REQUEST_BLOCKED`, `TURNSTILE_TOKEN_REQUIRED` или `BOOKING_ACCESS_TOKEN_REQUIRED`; остальная бизнес-логика не знает, каким способом получен `X-Booking-Access-Token`.

**Tech Stack:** TypeScript, Node.js 22, `@trigger.dev/sdk`, `@trigger.dev/build`, Playwright Chromium, Vitest, Zod, встроенный `fetch`, Telegram Bot API, PADL API `https://api.outdoor.sport.mos.ru`.

---

## Карта файлов

- Create: `package.json` - npm scripts, runtime dependencies и dev dependencies.
- Create: `tsconfig.json` - строгая TypeScript-конфигурация под Node 22.
- Create: `vitest.config.ts` - конфигурация unit-тестов.
- Create: `.gitignore` - исключения для `node_modules`, `.env`, build/cache артефактов.
- Create: `.env.example` - документированный набор env-переменных с рабочими примерными значениями.
- Create: `trigger.config.ts` - конфигурация Trigger.dev, runtime `node-22`, каталог задач `./trigger`, `maxDuration: 60`, Playwright build extension.
- Create: `src/types.ts` - доменные типы слотов, площадок, карточек событий, состояния и клиентов.
- Create: `src/config.ts` - чтение и валидация env.
- Create: `src/state.ts` - чистые функции состояния: нормализация metadata, добавление подписчиков, удаление подписчиков, offset.
- Create: `src/telegram.ts` - `getUpdates`, разбор `/start`, `sendMessage`, классификация ошибок блокировки.
- Create: `src/booking-access.ts` - адаптер получения `X-Booking-Access-Token`: HTTP PoW flow, browser fallback, кеширование и классификация ошибок антибот-защиты.
- Create: `src/padl-api.ts` - HTTP-клиент PADL: venues, event cards, `booking/date-options`, `booking/availability`; booking token получает только через инъектированный adapter.
- Create: `src/slot-filter.ts` - нормализация availability и фильтрация слотов по env.
- Create: `src/message-format.ts` - группировка, сортировка и нарезка Telegram-сообщений.
- Create: `src/state-store.ts` - чтение, lazy-create и запись Trigger.dev Session metadata.
- Create: `src/padl-monitor-run.ts` - чистый оркестратор одного run с инъекцией зависимостей.
- Create: `src/dry-run.ts` - локальный dry-run с моками Telegram/PADL/state-store.
- Create: `trigger/queues.ts` - очередь `padlMonitorQueue` с `concurrencyLimit: 1`.
- Create: `trigger/padl-state-session.ts` - no-op task для технической session.
- Create: `trigger/padl-monitor.ts` - scheduled task `padl-monitor` с cron `PADL_CRON` и queue concurrency.
- Create: `tests/config.test.ts`
- Create: `tests/state.test.ts`
- Create: `tests/telegram.test.ts`
- Create: `tests/slot-filter.test.ts`
- Create: `tests/message-format.test.ts`
- Create: `tests/booking-access.test.ts`
- Create: `tests/padl-api.test.ts`
- Create: `tests/state-store.test.ts`
- Create: `tests/padl-monitor-run.test.ts`
- Create: `tests/task-lifecycle.test.ts`

---

### Task 1: Scaffold проекта

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `trigger.config.ts`

- [ ] **Step 1: Создать базовые файлы проекта**

`package.json`:

```json
{
  "name": "padl-telegram-bot",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "dry-run": "tsx src/dry-run.ts",
    "trigger:dev": "trigger.dev dev",
    "trigger:deploy": "trigger.dev deploy",
    "verify": "npm run typecheck && npm test"
  },
  "dependencies": {
    "@trigger.dev/sdk": "latest",
    "playwright": "latest",
    "zod": "latest"
  },
  "devDependencies": {
    "@trigger.dev/build": "latest",
    "@types/node": "latest",
    "trigger.dev": "latest",
    "tsx": "latest",
    "typescript": "latest",
    "vitest": "latest"
  }
}
```

`tsconfig.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022", "DOM"],
    "types": ["node", "vitest/globals"],
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "outDir": "dist"
  },
  "include": ["src/**/*.ts", "trigger/**/*.ts", "tests/**/*.ts", "trigger.config.ts", "vitest.config.ts"]
}
```

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["tests/**/*.test.ts"],
    passWithNoTests: true,
  },
});
```

`.gitignore`:

```gitignore
node_modules/
dist/
.env
.trigger/
coverage/
```

`.env.example`:

```bash
TRIGGER_PROJECT_REF=proj_1234567890
TRIGGER_SECRET_KEY=tr_dev_1234567890
TELEGRAM_BOT_TOKEN=123456789:telegram-test-token
PADL_VENUES=all
PADL_TIME_FROM=10:00
PADL_TIME_TO=22:00
PADL_REQUIRED_PEOPLE=4
PADL_GAME_TYPES=free_play,masterclass,tournament_60,tournament_120,tournament_180
PADL_STATE_SESSION_EXTERNAL_ID=padl-telegram-bot-state
PADL_TIMEZONE=Europe/Moscow
PADL_CRON=* * * * *
PADL_MAX_MESSAGE_LENGTH=3900
TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS=0
PADL_HTTP_TIMEOUT_MS=12000
```

`trigger.config.ts`:

```ts
import { playwright } from "@trigger.dev/build/extensions/playwright";
import { defineConfig } from "@trigger.dev/sdk";

const project = process.env.TRIGGER_PROJECT_REF;

if (!project) {
  throw new Error("TRIGGER_PROJECT_REF обязателен для сборки Trigger.dev проекта");
}

export default defineConfig({
  project,
  dirs: ["./trigger"],
  runtime: "node-22",
  maxDuration: 60,
  build: {
    extensions: [
      playwright({
        browsers: ["chromium"],
        headless: true,
      }),
    ],
  },
  retries: {
    enabledInDev: false,
    default: {
      maxAttempts: 1,
      minTimeoutInMs: 1000,
      maxTimeoutInMs: 10000,
      factor: 2,
      randomize: false,
    },
  },
});
```

- [ ] **Step 2: Установить зависимости**

Run:

```bash
npm install
```

Expected: команда завершилась с кодом `0`, появился `package-lock.json`.

- [ ] **Step 3: Проверить пустой scaffold**

Run:

```bash
npm run typecheck
npm test
```

Expected: `tsc` проходит, Vitest сообщает, что тестовых файлов пока нет, и завершает команду с кодом `0` благодаря `passWithNoTests: true`.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .env.example trigger.config.ts
git commit -m "chore: scaffold trigger padl bot project"
```

---

### Task 2: Типы и env-конфигурация

**Files:**
- Create: `src/types.ts`
- Create: `src/config.ts`
- Test: `tests/config.test.ts`

- [ ] **Step 1: Написать failing tests для env parsing**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/config'`.

- [ ] **Step 3: Создать доменные типы**

```ts
export type VenueFilter =
  | { mode: "all"; values: [] }
  | { mode: "list"; values: string[] };

export type PadlConfig = {
  telegramBotToken: string;
  venues: VenueFilter;
  timeFromMinutes: number;
  timeToMinutes: number;
  requiredPeople: number;
  gameTypes: string[];
  stateSessionExternalId: string;
  timezone: "Europe/Moscow";
  cron: string;
  maxMessageLength: number;
  telegramGetUpdatesTimeoutSeconds: 0;
  httpTimeoutMs: number;
};

export type Subscriber = {
  chatId: number;
  firstSeenAt: string;
  lastStartAt: string;
};

export type BotState = {
  telegramOffset: number | null;
  subscribers: Record<string, Subscriber>;
};

export type PadlVenue = {
  id: number;
  title: string;
  address: string | null;
  workingHours: string | null;
  sort: number | null;
};

export type PadlEventCard = {
  id: number;
  title: string;
  eventType: string;
  venueId: number;
  eventIds: number[];
  sort: number | null;
};

export type RawAvailabilityEvent = {
  id: number;
  title?: string;
  max_tickets_per_booking?: number;
  allowed_durations?: number[];
  starts?: Array<{
    starts_at: string;
    time?: string;
    durations?: Record<string, { available_tickets?: number; is_available?: boolean; disabled?: boolean }>;
  }>;
};

export type NormalizedSlot = {
  venueId: number;
  venueTitle: string;
  venueOrder: number;
  venueSort: number;
  eventType: string;
  eventTitle: string;
  eventId: number;
  startsAt: string;
  moscowDateLabel: string;
  moscowTimeLabel: string;
  moscowMinutes: number;
  durationMinutes: number;
  availableTickets: number;
};
```

- [ ] **Step 4: Реализовать `loadConfig`**

```ts
import { z } from "zod";
import type { PadlConfig, VenueFilter } from "./types";

const HH_MM_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const envSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  PADL_VENUES: z.string().min(1),
  PADL_TIME_FROM: z.string().regex(HH_MM_RE),
  PADL_TIME_TO: z.string().regex(HH_MM_RE),
  PADL_REQUIRED_PEOPLE: z.coerce.number().int().positive(),
  PADL_GAME_TYPES: z.string().min(1),
  PADL_STATE_SESSION_EXTERNAL_ID: z.string().min(1).default("padl-telegram-bot-state"),
  PADL_TIMEZONE: z.literal("Europe/Moscow").default("Europe/Moscow"),
  PADL_CRON: z.string().min(1).default("* * * * *"),
  PADL_MAX_MESSAGE_LENGTH: z.coerce.number().int().min(100).max(4096).default(3900),
  TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS: z.coerce.number().int().min(0).default(0),
  PADL_HTTP_TIMEOUT_MS: z.coerce.number().int().min(1000).max(30000).default(12000),
});

function parseTime(value: string): number {
  const match = HH_MM_RE.exec(value);
  if (!match) {
    throw new Error(`Некорректное время: ${value}`);
  }
  const [, hours = "0", minutes = "0"] = match;
  return Number(hours) * 60 + Number(minutes);
}

function parseList(value: string): string[] {
  return value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseVenues(value: string): VenueFilter {
  if (value.trim().toLowerCase() === "all") {
    return { mode: "all", values: [] };
  }
  const values = parseList(value);
  if (values.length === 0) {
    throw new Error("PADL_VENUES должен быть all или непустым списком");
  }
  return { mode: "list", values };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): PadlConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const first = parsed.error.issues[0];
    const path = first?.path.join(".") || "unknown";
    const message = first?.message ?? parsed.error.message;
    throw new Error(`Некорректная env-переменная ${path}: ${message}`);
  }

  if (parsed.data.TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS !== 0) {
    throw new Error("TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS должен быть 0 в production-конфигурации");
  }

  return {
    telegramBotToken: parsed.data.TELEGRAM_BOT_TOKEN,
    venues: parseVenues(parsed.data.PADL_VENUES),
    timeFromMinutes: parseTime(parsed.data.PADL_TIME_FROM),
    timeToMinutes: parseTime(parsed.data.PADL_TIME_TO),
    requiredPeople: parsed.data.PADL_REQUIRED_PEOPLE,
    gameTypes: parseList(parsed.data.PADL_GAME_TYPES),
    stateSessionExternalId: parsed.data.PADL_STATE_SESSION_EXTERNAL_ID,
    timezone: parsed.data.PADL_TIMEZONE,
    cron: parsed.data.PADL_CRON,
    maxMessageLength: parsed.data.PADL_MAX_MESSAGE_LENGTH,
    telegramGetUpdatesTimeoutSeconds: 0,
    httpTimeoutMs: parsed.data.PADL_HTTP_TIMEOUT_MS,
  };
}
```

- [ ] **Step 5: Запустить тест**

Run:

```bash
npm test -- tests/config.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/config.ts tests/config.test.ts
git commit -m "feat: validate padl monitor environment"
```

---

### Task 3: Чистая модель состояния подписчиков

**Files:**
- Create: `src/state.ts`
- Test: `tests/state.test.ts`

- [ ] **Step 1: Написать failing tests для состояния**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/state.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/state'`.

- [ ] **Step 3: Реализовать `src/state.ts`**

```ts
import { z } from "zod";
import type { BotState } from "./types";

const subscriberSchema = z.object({
  chatId: z.number().int(),
  firstSeenAt: z.string().datetime(),
  lastStartAt: z.string().datetime(),
});

const stateSchema = z.object({
  telegramOffset: z.number().int().nonnegative().nullable().default(null),
  subscribers: z.record(z.string(), subscriberSchema).default({}),
});

export function createEmptyState(): BotState {
  return { telegramOffset: null, subscribers: {} };
}

export function parseBotState(metadata: unknown): BotState {
  if (metadata === null || metadata === undefined) {
    return createEmptyState();
  }
  const parsed = stateSchema.safeParse(metadata);
  if (!parsed.success) {
    throw new Error(`Некорректная Trigger.dev session metadata: ${parsed.error.message}`);
  }
  return parsed.data;
}

export function addStartSubscriber(state: BotState, chatId: number, nowIso: string): BotState {
  const key = String(chatId);
  const existing = state.subscribers[key];
  return {
    ...state,
    subscribers: {
      ...state.subscribers,
      [key]: {
        chatId,
        firstSeenAt: existing?.firstSeenAt ?? nowIso,
        lastStartAt: nowIso,
      },
    },
  };
}

export function removeSubscriber(state: BotState, chatId: number): BotState {
  const nextSubscribers = { ...state.subscribers };
  delete nextSubscribers[String(chatId)];
  return { ...state, subscribers: nextSubscribers };
}

export function setTelegramOffset(state: BotState, telegramOffset: number | null): BotState {
  return { ...state, telegramOffset };
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/state.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state.ts tests/state.test.ts
git commit -m "feat: manage telegram subscriber state"
```

---

### Task 4: Telegram update parsing и Bot API client

**Files:**
- Create: `src/telegram.ts`
- Test: `tests/telegram.test.ts`

- [ ] **Step 1: Написать failing tests для Telegram**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/telegram.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/telegram'`.

- [ ] **Step 3: Реализовать Telegram client**

```ts
type FetchLike = typeof fetch;

type TelegramApiResponse<T> = { ok: true; result: T } | { ok: false; error_code: number; description: string };

export type TelegramUpdate = {
  update_id: number;
  message?: {
    text?: string;
    chat?: { id?: number };
  };
};

export type TelegramClient = {
  getUpdates(input: { offset: number | null; timeoutSeconds: 0 }): Promise<TelegramUpdate[]>;
  sendMessage(input: { chatId: number; text: string }): Promise<void>;
};

export function extractStartChatIds(updates: TelegramUpdate[]): number[] {
  return updates
    .filter((update) => update.message?.text === "/start" || update.message?.text?.startsWith("/start "))
    .map((update) => update.message?.chat?.id)
    .filter((chatId): chatId is number => Number.isInteger(chatId));
}

export function nextTelegramOffset(updates: TelegramUpdate[], previousOffset: number | null): number | null {
  if (updates.length === 0) {
    return previousOffset;
  }
  return Math.max(...updates.map((update) => update.update_id)) + 1;
}

export function classifySendError(error: unknown): "remove-subscriber" | "keep-subscriber" {
  const candidate = error as { error_code?: number; description?: string };
  const description = String(candidate.description ?? "").toLowerCase();
  if (candidate.error_code === 403 && description.includes("blocked")) {
    return "remove-subscriber";
  }
  if (candidate.error_code === 400 && description.includes("chat not found")) {
    return "remove-subscriber";
  }
  return "keep-subscriber";
}

async function parseTelegramResponse<T>(response: Response): Promise<T> {
  const body = (await response.json()) as TelegramApiResponse<T>;
  if (!response.ok || !body.ok) {
    throw body;
  }
  return body.result;
}

export function createTelegramClient(input: {
  token: string;
  fetchImpl?: FetchLike;
  timeoutMs: number;
}): TelegramClient {
  const fetchImpl = input.fetchImpl ?? fetch;
  const baseUrl = `https://api.telegram.org/bot${input.token}`;

  async function call<T>(method: string, params: URLSearchParams): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), input.timeoutMs);
    try {
      const response = await fetchImpl(`${baseUrl}/${method}?${params.toString()}`, {
        method: "GET",
        signal: controller.signal,
      });
      return await parseTelegramResponse<T>(response);
    } finally {
      clearTimeout(timeout);
    }
  }

  return {
    async getUpdates({ offset, timeoutSeconds }) {
      const params = new URLSearchParams();
      if (offset !== null) {
        params.set("offset", String(offset));
      }
      params.set("timeout", String(timeoutSeconds));
      params.set("allowed_updates", JSON.stringify(["message"]));
      return await call<TelegramUpdate[]>("getUpdates", params);
    },
    async sendMessage({ chatId, text }) {
      const params = new URLSearchParams();
      params.set("chat_id", String(chatId));
      params.set("text", text);
      await call("sendMessage", params);
    },
  };
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/telegram.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/telegram.ts tests/telegram.test.ts
git commit -m "feat: add telegram polling client"
```

---

### Task 5: Форматирование Telegram-сообщений

**Files:**
- Create: `src/message-format.ts`
- Test: `tests/message-format.test.ts`

- [ ] **Step 1: Написать failing tests для сообщений**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/message-format.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/message-format'`.

- [ ] **Step 3: Реализовать форматирование**

```ts
import type { NormalizedSlot } from "./types";

const EMPTY_MESSAGE = "Свободных слотов сейчас нет";

function lineForSlot(slot: NormalizedSlot): string {
  return `${slot.moscowDateLabel} ${slot.moscowTimeLabel} — ${slot.availableTickets} чел. — ${slot.eventTitle}`;
}

function splitLines(lines: string[], maxLength: number): string[] {
  const messages: string[] = [];
  let current = "";

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length > maxLength && current) {
      messages.push(current.trimEnd());
      current = line;
    } else {
      current = candidate;
    }
  }

  if (current) {
    messages.push(current.trimEnd());
  }

  return messages;
}

export function formatSlotMessages(slots: NormalizedSlot[], maxLength: number): string[] {
  if (slots.length === 0) {
    return [EMPTY_MESSAGE];
  }

  const ordered = [...slots].sort((a, b) => {
    if (a.venueOrder !== b.venueOrder) return a.venueOrder - b.venueOrder;
    if (a.venueSort !== b.venueSort) return a.venueSort - b.venueSort;
    if (a.venueTitle !== b.venueTitle) return a.venueTitle.localeCompare(b.venueTitle, "ru");
    if (a.startsAt !== b.startsAt) return a.startsAt.localeCompare(b.startsAt);
    return a.durationMinutes - b.durationMinutes;
  });

  const lines: string[] = [];
  let currentVenueId: number | null = null;

  for (const slot of ordered) {
    if (currentVenueId !== slot.venueId) {
      if (lines.length > 0) {
        lines.push("");
      }
      lines.push(slot.venueTitle);
      currentVenueId = slot.venueId;
    }
    lines.push(lineForSlot(slot));
  }

  return splitLines(lines, maxLength);
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/message-format.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/message-format.ts tests/message-format.test.ts
git commit -m "feat: format padl slot messages"
```

---

### Task 6: Фильтрация и нормализация слотов

**Files:**
- Create: `src/slot-filter.ts`
- Test: `tests/slot-filter.test.ts`

- [ ] **Step 1: Написать failing tests для slot-filter**

```ts
import { describe, expect, it } from "vitest";
import { normalizeAndFilterSlots } from "../src/slot-filter";
import type { PadlConfig, PadlEventCard, PadlVenue, RawAvailabilityEvent } from "../src/types";

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

const venue: PadlVenue = {
  id: 12,
  title: "Ст. метро Баррикадная",
  address: null,
  workingHours: null,
  sort: 1,
};

const venueTretyakovskaya: PadlVenue = {
  id: 13,
  title: "Ст. метро Третьяковская",
  address: null,
  workingHours: null,
  sort: 2,
};

const card: PadlEventCard = {
  id: 1,
  title: "Свободная игра",
  eventType: "free_play",
  venueId: 12,
  eventIds: [147],
  sort: 1,
};

const cardTretyakovskaya: PadlEventCard = {
  id: 2,
  title: "Свободная игра",
  eventType: "free_play",
  venueId: 13,
  eventIds: [148],
  sort: 1,
};

const event: RawAvailabilityEvent = {
  id: 147,
  title: "Свободная игра",
  max_tickets_per_booking: 4,
  allowed_durations: [60],
  starts: [
    {
      starts_at: "2026-07-06T15:00:00.000Z",
      time: "18:00",
      durations: {
        "60": { available_tickets: 4, is_available: true },
        "90": { available_tickets: 3, is_available: true },
      },
    },
  ],
};

const eventTretyakovskaya: RawAvailabilityEvent = {
  ...event,
  id: 148,
};

describe("normalizeAndFilterSlots", () => {
  it("оставляет только строгое равенство available_tickets", () => {
    const slots = normalizeAndFilterSlots({ config, venues: [venue], eventCards: [card], availabilityEvents: [event] });

    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({ availableTickets: 4, durationMinutes: 60 });
  });

  it("включает границы времени", () => {
    const slots = normalizeAndFilterSlots({ config, venues: [venue], eventCards: [card], availabilityEvents: [event] });

    expect(slots[0]?.moscowMinutes).toBe(1080);
  });

  it("фильтрует площадки по точному id или названию", () => {
    const slots = normalizeAndFilterSlots({
      config: { ...config, venues: { mode: "list", values: ["Ст. метро Римская"] } },
      venues: [venue],
      eventCards: [card],
      availabilityEvents: [event],
    });

    expect(slots).toEqual([]);
  });

  it("фильтрует типы игр", () => {
    const slots = normalizeAndFilterSlots({
      config: { ...config, gameTypes: ["masterclass"] },
      venues: [venue],
      eventCards: [card],
      availabilityEvents: [event],
    });

    expect(slots).toEqual([]);
  });

  it("проставляет порядок площадок из PADL_VENUES", () => {
    const slots = normalizeAndFilterSlots({
      config: { ...config, venues: { mode: "list", values: ["Ст. метро Третьяковская", "12"] } },
      venues: [venue, venueTretyakovskaya],
      eventCards: [card, cardTretyakovskaya],
      availabilityEvents: [event, eventTretyakovskaya],
    });

    expect(slots.map((slot) => [slot.venueTitle, slot.venueOrder])).toEqual([
      ["Ст. метро Баррикадная", 1],
      ["Ст. метро Третьяковская", 0],
    ]);
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/slot-filter.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/slot-filter'`.

- [ ] **Step 3: Реализовать фильтрацию**

```ts
import type { NormalizedSlot, PadlConfig, PadlEventCard, PadlVenue, RawAvailabilityEvent } from "./types";

function moscowParts(iso: string): { dateLabel: string; timeLabel: string; minutes: number } {
  const formatter = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(formatter.formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  const hour = Number(parts.hour ?? "0");
  const minute = Number(parts.minute ?? "0");
  return {
    dateLabel: `${parts.day ?? "??"}.${parts.month ?? "??"}`,
    timeLabel: `${parts.hour ?? "00"}:${parts.minute ?? "00"}`,
    minutes: hour * 60 + minute,
  };
}

function venueMatches(config: PadlConfig, venue: PadlVenue): boolean {
  if (config.venues.mode === "all") {
    return true;
  }
  return config.venues.values.some((value) => value === String(venue.id) || value === venue.title);
}

function venueOrder(config: PadlConfig, venue: PadlVenue): number {
  if (config.venues.mode === "all") {
    return venue.sort ?? 9999;
  }
  const index = config.venues.values.findIndex((value) => value === String(venue.id) || value === venue.title);
  return index === -1 ? 9999 : index;
}

export function normalizeAndFilterSlots(input: {
  config: PadlConfig;
  venues: PadlVenue[];
  eventCards: PadlEventCard[];
  availabilityEvents: RawAvailabilityEvent[];
}): NormalizedSlot[] {
  const venuesById = new Map(input.venues.map((venue) => [venue.id, venue]));
  const cardsByEventId = new Map<number, PadlEventCard>();

  for (const card of input.eventCards) {
    for (const eventId of card.eventIds) {
      cardsByEventId.set(eventId, card);
    }
  }

  const slots: NormalizedSlot[] = [];

  for (const event of input.availabilityEvents) {
    const card = cardsByEventId.get(event.id);
    if (!card || !input.config.gameTypes.includes(card.eventType)) {
      continue;
    }
    const venue = venuesById.get(card.venueId);
    if (!venue || !venueMatches(input.config, venue)) {
      continue;
    }

    for (const start of event.starts ?? []) {
      const parts = moscowParts(start.starts_at);
      if (parts.minutes < input.config.timeFromMinutes || parts.minutes > input.config.timeToMinutes) {
        continue;
      }

      for (const [durationKey, duration] of Object.entries(start.durations ?? {})) {
        const durationMinutes = Number(durationKey);
        const availableTickets = Number(duration.available_tickets ?? 0);
        const isAvailable = duration.is_available !== false && duration.disabled !== true;
        if (!Number.isFinite(durationMinutes) || !isAvailable || availableTickets !== input.config.requiredPeople) {
          continue;
        }

        slots.push({
          venueId: venue.id,
          venueTitle: venue.title,
          venueOrder: venueOrder(input.config, venue),
          venueSort: venue.sort ?? 9999,
          eventType: card.eventType,
          eventTitle: event.title ?? card.title,
          eventId: event.id,
          startsAt: start.starts_at,
          moscowDateLabel: parts.dateLabel,
          moscowTimeLabel: parts.timeLabel,
          moscowMinutes: parts.minutes,
          durationMinutes,
          availableTickets,
        });
      }
    }
  }

  return slots;
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/slot-filter.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/slot-filter.ts tests/slot-filter.test.ts
git commit -m "feat: filter padl availability slots"
```

---

### Task 7: PADL API client

**Files:**
- Create: `src/padl-api.ts`
- Test: `tests/padl-api.test.ts`

- [ ] **Step 1: Написать failing tests для PADL API без логики получения booking token**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/padl-api.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/padl-api'`.

- [ ] **Step 3: Реализовать HTTP client**

```ts
import type { PadlEventCard, PadlVenue, RawAvailabilityEvent } from "./types";

type FetchLike = typeof fetch;
type BookingAccessTokenProvider = (scope: { venueId: number; eventType: string }) => Promise<string | null>;

const BASE_URL = "https://api.outdoor.sport.mos.ru";
const SITE_ORIGIN = "https://outdoor.sport.mos.ru";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const PADL_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: SITE_ORIGIN,
  Referer: `${SITE_ORIGIN}/`,
  "User-Agent": BROWSER_USER_AGENT,
};

async function fetchJson<T>(fetchImpl: FetchLike, url: URL, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    if (!response.ok) {
      throw new Error(`PADL API ${url.pathname} вернул HTTP ${response.status}`);
    }
    return (await response.json()) as T;
  } finally {
    clearTimeout(timeout);
  }
}

function dataArray<T>(body: { data?: T[] }): T[] {
  return Array.isArray(body.data) ? body.data : [];
}

function bookingHeaders(token: string | null): Record<string, string> {
  return token ? { ...PADL_HEADERS, "X-Booking-Access-Token": token } : PADL_HEADERS;
}

export function createPadlApiClient(input: {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  bookingAccessTokenProvider?: BookingAccessTokenProvider;
}) {
  const fetchImpl = input.fetchImpl ?? fetch;
  const getToken = input.bookingAccessTokenProvider ?? (async () => null);

  return {
    async getVenues(): Promise<PadlVenue[]> {
      const url = new URL("/items/venues", BASE_URL);
      url.searchParams.set("filter[status][_eq]", "published");
      url.searchParams.set("sort", "sort");
      url.searchParams.set("fields", "id,title,address,working_hours,sort,status");
      const body = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
        fetchImpl,
        url,
        { headers: PADL_HEADERS },
        input.timeoutMs
      );
      return dataArray(body).map((item) => ({
        id: Number(item.id),
        title: String(item.title),
        address: item.address === null || item.address === undefined ? null : String(item.address),
        workingHours: item.working_hours === null || item.working_hours === undefined ? null : String(item.working_hours),
        sort: item.sort === null || item.sort === undefined ? null : Number(item.sort),
      }));
    },
    async getEventCards(): Promise<PadlEventCard[]> {
      const url = new URL("/items/event_cards", BASE_URL);
      url.searchParams.set("sort", "sort,id");
      url.searchParams.set("fields", "id,sort,title,description,ms_night,event_type,venue_id,events");
      url.searchParams.set("deep[events][_limit]", "-1");
      const body = await fetchJson<{ data?: Array<Record<string, unknown>> }>(
        fetchImpl,
        url,
        { headers: PADL_HEADERS },
        input.timeoutMs
      );
      return dataArray(body).map((item) => ({
        id: Number(item.id),
        title: String(item.title),
        eventType: String(item.event_type),
        venueId: Number(item.venue_id),
        eventIds: Array.isArray(item.events) ? item.events.map(Number).filter(Number.isFinite) : [],
        sort: item.sort === null || item.sort === undefined ? null : Number(item.sort),
      }));
    },
    async getDateOptions(inputScope: { venueId: number; eventType: string }) {
      const url = new URL("/booking/date-options", BASE_URL);
      url.searchParams.set("venue_id", String(inputScope.venueId));
      url.searchParams.set("event_type", inputScope.eventType);
      const token = await getToken(inputScope);
      return await fetchJson<Record<string, unknown>>(
        fetchImpl,
        url,
        { headers: bookingHeaders(token) },
        input.timeoutMs
      );
    },
    async getAvailability(inputScope: { venueId: number; eventType: string; courtId: number; date: string }) {
      const url = new URL("/booking/availability", BASE_URL);
      url.searchParams.set("venue_id", String(inputScope.venueId));
      url.searchParams.set("event_type", inputScope.eventType);
      url.searchParams.set("court_id", String(inputScope.courtId));
      url.searchParams.set("date", inputScope.date);
      const token = await getToken(inputScope);
      const body = await fetchJson<{ events?: RawAvailabilityEvent[] }>(
        fetchImpl,
        url,
        { headers: bookingHeaders(token) },
        input.timeoutMs
      );
      return Array.isArray(body.events) ? body.events : [];
    },
  };
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/padl-api.test.ts
```

Expected: PASS.

- [ ] **Step 5: Зафиксировать интеграционную заметку в комментарии plan execution log**

Записать в рабочий лог исполнителя: прямые запросы к `https://api.outdoor.sport.mos.ru/booking/date-options` и `/booking/availability` отвечают `403` без `X-Booking-Access-Token`; `/booking/pow` и `/booking/access` должны идти через `booking-access` adapter. Если HTTP flow получает `BOT_REQUEST_BLOCKED`, `TURNSTILE_TOKEN_REQUIRED` или `BOOKING_ACCESS_TOKEN_REQUIRED`, это не отдельный будущий проект, а штатный trigger для browser fallback из Task 8.

- [ ] **Step 6: Commit**

```bash
git add src/padl-api.ts tests/padl-api.test.ts
git commit -m "feat: add padl api client"
```

---

### Task 8: Booking access adapter с HTTP и browser fallback

**Files:**
- Create: `src/booking-access.ts`
- Test: `tests/booking-access.test.ts`

- [ ] **Step 1: Написать failing tests для booking-access**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/booking-access.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/booking-access'`.

- [ ] **Step 3: Реализовать booking-access adapter**

```ts
import { createHash } from "node:crypto";

type FetchLike = typeof fetch;

export type BookingAccessScope = { venueId: number; eventType: string };
export type BookingAccessTokenProvider = (scope: BookingAccessScope) => Promise<string | null>;
export type BookingAccessErrorCode =
  | "BOT_REQUEST_BLOCKED"
  | "TURNSTILE_TOKEN_REQUIRED"
  | "BOOKING_ACCESS_TOKEN_REQUIRED"
  | "POW_INVALID"
  | "HTTP_ERROR";

const BASE_URL = "https://api.outdoor.sport.mos.ru";
const SITE_URL = "https://outdoor.sport.mos.ru/#venues-events";
const SITE_ORIGIN = "https://outdoor.sport.mos.ru";
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const BROWSER_HEADERS = {
  Accept: "application/json, text/plain, */*",
  Origin: SITE_ORIGIN,
  Referer: `${SITE_ORIGIN}/`,
  "User-Agent": BROWSER_USER_AGENT,
};

export class BookingAccessError extends Error {
  constructor(
    public readonly code: BookingAccessErrorCode,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "BookingAccessError";
  }
}

function extractApiErrorCode(body: unknown): BookingAccessErrorCode | null {
  const errors = (body as { errors?: Array<{ extensions?: { code?: string } }> }).errors;
  const code = errors?.[0]?.extensions?.code;
  if (
    code === "BOT_REQUEST_BLOCKED" ||
    code === "TURNSTILE_TOKEN_REQUIRED" ||
    code === "BOOKING_ACCESS_TOKEN_REQUIRED" ||
    code === "POW_INVALID"
  ) {
    return code;
  }
  return null;
}

function apiErrorFromBody(body: unknown, status: number, fallbackMessage: string): BookingAccessError {
  const code = extractApiErrorCode(body) ?? "HTTP_ERROR";
  const message = (body as { errors?: Array<{ message?: string }> }).errors?.[0]?.message ?? fallbackMessage;
  return new BookingAccessError(code, message, status);
}

async function fetchBookingJson<T>(fetchImpl: FetchLike, url: URL, init: RequestInit, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(url, { ...init, signal: controller.signal });
    const body = (await response.json().catch(() => null)) as unknown;
    if (!response.ok) {
      throw apiErrorFromBody(body, response.status, `PADL booking API ${url.pathname} вернул HTTP ${response.status}`);
    }
    return body as T;
  } finally {
    clearTimeout(timeout);
  }
}

function leadingZeroBits(buffer: Buffer): number {
  let bits = 0;
  for (const byte of buffer) {
    if (byte === 0) {
      bits += 8;
      continue;
    }
    for (let mask = 128; mask > 0 && (byte & mask) === 0; mask >>= 1) {
      bits += 1;
    }
    break;
  }
  return bits;
}

export async function solveProofOfWork(challenge: string, bits: number, timeoutMs: number): Promise<{ nonce: number; ms: number }> {
  const startedAt = Date.now();
  for (let nonce = 0; ; nonce += 1) {
    const digest = createHash("sha256").update(`${challenge}:${nonce}`).digest();
    if (leadingZeroBits(digest) >= bits) {
      return { nonce, ms: Date.now() - startedAt };
    }
    if (nonce % 1024 === 0 && Date.now() - startedAt > timeoutMs) {
      throw new BookingAccessError("HTTP_ERROR", "Не удалось решить PADL proof-of-work за отведенное время");
    }
  }
}

export function shouldUseBrowserFallback(error: unknown): boolean {
  return (
    error instanceof BookingAccessError &&
    (error.code === "BOT_REQUEST_BLOCKED" ||
      error.code === "TURNSTILE_TOKEN_REQUIRED" ||
      error.code === "BOOKING_ACCESS_TOKEN_REQUIRED")
  );
}

export function createHttpBookingAccessTokenProvider(input: {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  now?: () => number;
}): BookingAccessTokenProvider {
  const fetchImpl = input.fetchImpl ?? fetch;
  const now = input.now ?? Date.now;
  let cached: { token: string; expiresAtMs: number; scopeKey: string } | null = null;

  return async (scope) => {
    const scopeKey = `${scope.venueId}:${scope.eventType}`;
    if (cached && cached.scopeKey === scopeKey && cached.expiresAtMs - 30_000 > now()) {
      return cached.token;
    }

    const powUrl = new URL("/booking/pow", BASE_URL);
    const pow = await fetchBookingJson<{ enabled?: boolean; challenge?: string; bits?: number }>(
      fetchImpl,
      powUrl,
      { method: "POST", headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" }, body: "{}" },
      input.timeoutMs
    );

    const body: Record<string, unknown> = {
      venue_id: scope.venueId,
      event_type: scope.eventType,
    };
    if (pow.enabled && pow.challenge) {
      const solved = await solveProofOfWork(pow.challenge, Number(pow.bits ?? 0), input.timeoutMs);
      body.pow_challenge = pow.challenge;
      body.pow_nonce = solved.nonce;
      body.pow_bits = Number(pow.bits ?? 0);
      body.pow_solve_ms = solved.ms;
    }

    const accessUrl = new URL("/booking/access", BASE_URL);
    const access = await fetchBookingJson<{ enabled?: boolean; access_token?: string; ttl_seconds?: number }>(
      fetchImpl,
      accessUrl,
      { method: "POST", headers: { ...BROWSER_HEADERS, "Content-Type": "application/json" }, body: JSON.stringify(body) },
      input.timeoutMs
    );
    if (!access.enabled) {
      cached = null;
      return null;
    }
    if (!access.access_token) {
      throw new BookingAccessError("HTTP_ERROR", "PADL booking access token не был возвращен HTTP flow");
    }

    cached = {
      token: access.access_token,
      expiresAtMs: now() + Math.max(0, Number(access.ttl_seconds ?? 0)) * 1000,
      scopeKey,
    };
    return cached.token;
  };
}

export function createBrowserBookingAccessTokenProvider(input: { timeoutMs: number }): BookingAccessTokenProvider {
  return async (scope) => {
    const { chromium } = await import("playwright");
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext({
        userAgent: BROWSER_USER_AGENT,
        extraHTTPHeaders: { "Accept-Language": "ru-RU,ru;q=0.9,en;q=0.8" },
      });
      const page = await context.newPage();
      page.setDefaultTimeout(input.timeoutMs);
      await page.goto(SITE_URL, { waitUntil: "domcontentloaded", timeout: input.timeoutMs });
      await page.waitForLoadState("networkidle", { timeout: Math.min(input.timeoutMs, 5000) }).catch(() => undefined);

      const powResponse = await page.evaluate(async () => {
        const response = await fetch("https://api.outdoor.sport.mos.ru/booking/pow", {
          method: "POST",
          headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
          body: "{}",
          credentials: "include",
        });
        return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
      });
      if (!powResponse.ok) {
        throw apiErrorFromBody(powResponse.body, powResponse.status, "PADL browser pow flow завершился ошибкой");
      }

      const pow = powResponse.body as { enabled?: boolean; challenge?: string; bits?: number };
      const accessBody: Record<string, unknown> = {
        venue_id: scope.venueId,
        event_type: scope.eventType,
      };
      if (pow.enabled && pow.challenge) {
        const solved = await solveProofOfWork(pow.challenge, Number(pow.bits ?? 0), input.timeoutMs);
        accessBody.pow_challenge = pow.challenge;
        accessBody.pow_nonce = solved.nonce;
        accessBody.pow_bits = Number(pow.bits ?? 0);
        accessBody.pow_solve_ms = solved.ms;
      }

      const turnstileToken = await page.evaluate(() => {
        const input = document.querySelector<HTMLInputElement>(
          'input[name="cf-turnstile-response"], textarea[name="cf-turnstile-response"]'
        );
        return input?.value || null;
      });
      if (turnstileToken) {
        accessBody.turnstile_token = turnstileToken;
      }

      const accessResponse = await page.evaluate(async (body) => {
        const response = await fetch("https://api.outdoor.sport.mos.ru/booking/access", {
          method: "POST",
          headers: { Accept: "application/json, text/plain, */*", "Content-Type": "application/json" },
          body: JSON.stringify(body),
          credentials: "include",
        });
        return { ok: response.ok, status: response.status, body: await response.json().catch(() => null) };
      }, accessBody);
      if (!accessResponse.ok) {
        throw apiErrorFromBody(accessResponse.body, accessResponse.status, "PADL browser access flow завершился ошибкой");
      }

      const access = accessResponse.body as { enabled?: boolean; access_token?: string };
      if (!access.enabled) {
        return null;
      }
      if (!access.access_token) {
        throw new BookingAccessError("HTTP_ERROR", "PADL booking access token не был возвращен browser flow");
      }
      return access.access_token;
    } finally {
      await browser.close();
    }
  };
}

export function createBookingAccessTokenProvider(input: {
  fetchImpl?: FetchLike;
  timeoutMs: number;
  httpProvider?: BookingAccessTokenProvider;
  browserProvider?: BookingAccessTokenProvider;
  mode?: "auto" | "http" | "browser";
  now?: () => number;
  log?: Pick<Console, "log" | "error">;
}): BookingAccessTokenProvider {
  const now = input.now ?? Date.now;
  const mode = input.mode ?? "auto";
  const httpProviderInput = input.fetchImpl
    ? { fetchImpl: input.fetchImpl, timeoutMs: input.timeoutMs, now }
    : { timeoutMs: input.timeoutMs, now };
  const httpProvider =
    input.httpProvider ??
    createHttpBookingAccessTokenProvider(httpProviderInput);
  const browserProvider = input.browserProvider ?? createBrowserBookingAccessTokenProvider({ timeoutMs: input.timeoutMs });
  let cached: { token: string; expiresAtMs: number; scopeKey: string } | null = null;

  async function remember(scope: BookingAccessScope, token: string | null): Promise<string | null> {
    if (token) {
      cached = {
        token,
        scopeKey: `${scope.venueId}:${scope.eventType}`,
        expiresAtMs: now() + 5 * 60 * 1000,
      };
    }
    return token;
  }

  return async (scope) => {
    const scopeKey = `${scope.venueId}:${scope.eventType}`;
    if (cached && cached.scopeKey === scopeKey && cached.expiresAtMs - 30_000 > now()) {
      return cached.token;
    }

    if (mode === "browser") {
      input.log?.log("padl-booking-access", { source: "browser", venueId: scope.venueId, eventType: scope.eventType });
      return await remember(scope, await browserProvider(scope));
    }
    if (mode === "http") {
      input.log?.log("padl-booking-access", { source: "http", venueId: scope.venueId, eventType: scope.eventType });
      return await remember(scope, await httpProvider(scope));
    }

    try {
      const token = await httpProvider(scope);
      input.log?.log("padl-booking-access", { source: "http", venueId: scope.venueId, eventType: scope.eventType });
      return await remember(scope, token);
    } catch (error) {
      if (!shouldUseBrowserFallback(error)) {
        throw error;
      }
      input.log?.log("padl-booking-access", {
        source: "browser",
        venueId: scope.venueId,
        eventType: scope.eventType,
        reason: error instanceof BookingAccessError ? error.code : "unknown",
      });
      return await remember(scope, await browserProvider(scope));
    }
  };
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/booking-access.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/booking-access.ts tests/booking-access.test.ts
git commit -m "feat: add padl booking access adapter"
```

---

### Task 9: Trigger.dev Session state-store

**Files:**
- Create: `src/state-store.ts`
- Test: `tests/state-store.test.ts`

- [ ] **Step 1: Написать failing tests для state-store через fake sessions API**

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/state-store.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/state-store'`.

- [ ] **Step 3: Реализовать state-store**

```ts
import { sessions } from "@trigger.dev/sdk";
import { createEmptyState, parseBotState } from "./state";
import type { BotState } from "./types";

type SessionsApi = Pick<typeof sessions, "retrieve" | "start" | "update">;

function isNotFound(error: unknown): boolean {
  const candidate = error as { status?: number; statusCode?: number; code?: string };
  return candidate.status === 404 || candidate.statusCode === 404 || candidate.code === "NOT_FOUND";
}

export function createSessionStateStore(input: {
  sessionsApi?: SessionsApi;
  externalId: string;
}) {
  const sessionsApi = input.sessionsApi ?? sessions;

  return {
    async load(): Promise<BotState> {
      try {
        const session = await sessionsApi.retrieve(input.externalId);
        return parseBotState(session.metadata);
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
        await sessionsApi.start({
          type: "padl.telegram-state",
          externalId: input.externalId,
          taskIdentifier: "padl-state-session",
          triggerConfig: {
            basePayload: {},
            tags: ["padl:telegram-state"],
            maxAttempts: 1,
          },
        });
        return createEmptyState();
      }
    },
    async save(state: BotState): Promise<void> {
      await sessionsApi.update(input.externalId, { metadata: state });
    },
  };
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/state-store.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/state-store.ts tests/state-store.test.ts
git commit -m "feat: store bot state in trigger sessions"
```

---

### Task 10: Оркестратор одного run

**Files:**
- Create: `src/padl-monitor-run.ts`
- Test: `tests/padl-monitor-run.test.ts`

- [ ] **Step 1: Написать failing tests для оркестратора**

```ts
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
      getDateOptions: vi.fn(),
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
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/padl-monitor-run.test.ts
```

Expected: FAIL с ошибкой импорта `Cannot find module '../src/padl-monitor-run'`.

- [ ] **Step 3: Реализовать оркестратор**

```ts
import { formatSlotMessages } from "./message-format";
import { normalizeAndFilterSlots } from "./slot-filter";
import { addStartSubscriber, removeSubscriber, setTelegramOffset } from "./state";
import { classifySendError, extractStartChatIds, nextTelegramOffset } from "./telegram";
import type { BotState, PadlConfig, PadlEventCard, PadlVenue, RawAvailabilityEvent } from "./types";

type StateStore = {
  load(): Promise<BotState>;
  save(state: BotState): Promise<void>;
};

type Telegram = {
  getUpdates(input: { offset: number | null; timeoutSeconds: 0 }): Promise<Parameters<typeof extractStartChatIds>[0]>;
  sendMessage(input: { chatId: number; text: string }): Promise<void>;
};

type Padl = {
  getVenues(): Promise<PadlVenue[]>;
  getEventCards(): Promise<PadlEventCard[]>;
  getDateOptions(input: { venueId: number; eventType: string }): Promise<unknown>;
  getAvailability(input: { venueId: number; eventType: string; courtId: number; date: string }): Promise<RawAvailabilityEvent[]>;
};

async function collectAvailability(_padl: Padl): Promise<RawAvailabilityEvent[]> {
  // Первый проход оставляет сбор booking availability за Task 11: здесь возвращается пустой список,
  // чтобы Telegram/state/orchestration были полностью проверяемы до интеграции booking API.
  return [];
}

export async function runPadlMonitorOnce(input: {
  config: PadlConfig;
  stateStore: StateStore;
  telegram: Telegram;
  padl: Padl;
  now?: () => string;
  log?: Pick<Console, "log" | "error">;
}): Promise<void> {
  const log = input.log ?? console;
  const startedAtMs = Date.now();
  const startedAt = new Date(startedAtMs).toISOString();
  let state = await input.stateStore.load();

  const updates = await input.telegram.getUpdates({
    offset: state.telegramOffset,
    timeoutSeconds: input.config.telegramGetUpdatesTimeoutSeconds,
  });
  for (const chatId of extractStartChatIds(updates)) {
    state = addStartSubscriber(state, chatId, input.now?.() ?? new Date().toISOString());
  }
  state = setTelegramOffset(state, nextTelegramOffset(updates, state.telegramOffset));

  let messages: string[];
  let slotsFound = 0;
  let slotSearchMs = 0;
  const slotSearchStartedAt = Date.now();
  try {
    const [venues, eventCards, availabilityEvents] = await Promise.all([
      input.padl.getVenues(),
      input.padl.getEventCards(),
      collectAvailability(input.padl),
    ]);
    const slots = normalizeAndFilterSlots({ config: input.config, venues, eventCards, availabilityEvents });
    slotsFound = slots.length;
    messages = formatSlotMessages(slots, input.config.maxMessageLength);
    slotSearchMs = Date.now() - slotSearchStartedAt;
    log.log("padl-monitor slots", { slots: slotsFound, slotSearchMs });
  } catch (error) {
    slotSearchMs = Date.now() - slotSearchStartedAt;
    log.error("padl-monitor slot fetch failed", error);
    messages = ["Не удалось проверить слоты. Попробую снова через минуту."];
  }

  let sentMessages = 0;
  const sendStartedAt = Date.now();
  for (const subscriber of Object.values(state.subscribers)) {
    for (const text of messages) {
      try {
        await input.telegram.sendMessage({ chatId: subscriber.chatId, text });
        sentMessages += 1;
      } catch (error) {
        log.error("padl-monitor telegram send failed", { chatId: subscriber.chatId, error });
        if (classifySendError(error) === "remove-subscriber") {
          state = removeSubscriber(state, subscriber.chatId);
          break;
        }
      }
    }
  }
  const sendMs = Date.now() - sendStartedAt;

  await input.stateStore.save(state);
  const finishedAtMs = Date.now();
  log.log("padl-monitor completed", {
    startedAt,
    finishedAt: new Date(finishedAtMs).toISOString(),
    subscribers: Object.keys(state.subscribers).length,
    slotsFound,
    sentMessages,
    slotSearchMs,
    sendMs,
    durationMs: finishedAtMs - startedAtMs,
  });
}
```

- [ ] **Step 4: Запустить тест**

Run:

```bash
npm test -- tests/padl-monitor-run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/padl-monitor-run.ts tests/padl-monitor-run.test.ts
git commit -m "feat: orchestrate single padl monitor run"
```

---

### Task 11: Сбор booking availability

**Files:**
- Modify: `src/padl-monitor-run.ts`
- Test: `tests/padl-monitor-run.test.ts`

- [ ] **Step 1: Расширить failing test для сбора availability**

Добавить в `tests/padl-monitor-run.test.ts`:

```ts
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
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/padl-monitor-run.test.ts
```

Expected: FAIL, потому что `collectAvailability` возвращает пустой список и не вызывает `getDateOptions`.

- [ ] **Step 3: Реализовать `collectAvailability`**

```ts
type Padl = {
  getVenues(): Promise<PadlVenue[]>;
  getEventCards(): Promise<PadlEventCard[]>;
  getDateOptions(input: { venueId: number; eventType: string }): Promise<unknown>;
  getAvailability(input: { venueId: number; eventType: string; courtId: number; date: string }): Promise<RawAvailabilityEvent[]>;
};

function venueMatches(config: PadlConfig, venue: PadlVenue): boolean {
  if (config.venues.mode === "all") {
    return true;
  }
  return config.venues.values.some((value) => value === String(venue.id) || value === venue.title);
}

function extractCourtDates(dateOptions: unknown): Array<{ courtId: number; date: string }> {
  const body = dateOptions as { courts?: Array<{ id?: number; dates?: Array<{ date?: string; disabled?: boolean }> }> };
  const result: Array<{ courtId: number; date: string }> = [];
  for (const court of body.courts ?? []) {
    const courtId = court.id;
    if (typeof courtId !== "number" || !Number.isInteger(courtId)) continue;
    for (const date of court.dates ?? []) {
      if (typeof date.date === "string" && date.disabled !== true) {
        result.push({ courtId, date: date.date });
      }
    }
  }
  return result;
}

async function collectAvailability(input: {
  padl: Padl;
  config: PadlConfig;
  venues: PadlVenue[];
  eventCards: PadlEventCard[];
}): Promise<RawAvailabilityEvent[]> {
  const chunks: RawAvailabilityEvent[][] = [];
  const uniquePairs = new Map<string, { venueId: number; eventType: string }>();
  const venuesById = new Map(input.venues.map((venue) => [venue.id, venue]));

  for (const card of input.eventCards) {
    const venue = venuesById.get(card.venueId);
    if (!venue || !venueMatches(input.config, venue) || !input.config.gameTypes.includes(card.eventType)) {
      continue;
    }
    uniquePairs.set(`${card.venueId}:${card.eventType}`, { venueId: card.venueId, eventType: card.eventType });
  }

  for (const pair of uniquePairs.values()) {
    const dateOptions = await input.padl.getDateOptions(pair);
    for (const option of extractCourtDates(dateOptions)) {
      chunks.push(
        await input.padl.getAvailability({
          venueId: pair.venueId,
          eventType: pair.eventType,
          courtId: option.courtId,
          date: option.date,
        })
      );
    }
  }

  return chunks.flat();
}
```

Заменить вызов в `runPadlMonitorOnce`:

```ts
const [venues, eventCards] = await Promise.all([input.padl.getVenues(), input.padl.getEventCards()]);
const availabilityEvents = await collectAvailability({
  padl: input.padl,
  config: input.config,
  venues,
  eventCards,
});
```

- [ ] **Step 4: Запустить тест оркестратора**

Run:

```bash
npm test -- tests/padl-monitor-run.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/padl-monitor-run.ts tests/padl-monitor-run.test.ts
git commit -m "feat: collect padl booking availability"
```

---

### Task 12: Trigger.dev tasks

**Files:**
- Create: `trigger/queues.ts`
- Create: `trigger/padl-state-session.ts`
- Create: `trigger/padl-monitor.ts`
- Test: `tests/task-lifecycle.test.ts`

- [ ] **Step 1: Написать lifecycle tests**

```ts
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("Trigger task lifecycle", () => {
  it("scheduled task использует queue concurrencyLimit 1", () => {
    const queueSource = readFileSync("trigger/queues.ts", "utf8");
    const taskSource = readFileSync("trigger/padl-monitor.ts", "utf8");

    expect(queueSource).toContain("concurrencyLimit: 1");
    expect(taskSource).toContain("queue: padlMonitorQueue");
  });

  it("scheduled task не содержит запрещенные runtime loops", () => {
    const taskSource = readFileSync("trigger/padl-monitor.ts", "utf8");

    expect(taskSource).not.toContain("while (true)");
    expect(taskSource).not.toContain("setInterval");
    expect(taskSource).not.toContain("wait.for");
    expect(taskSource).not.toContain(".trigger(");
  });

  it("scheduled task вызывает getUpdates timeout 0 через config", () => {
    const taskSource = readFileSync("trigger/padl-monitor.ts", "utf8");

    expect(taskSource).toContain("loadConfig()");
    expect(taskSource).toContain("runPadlMonitorOnce");
  });
});
```

- [ ] **Step 2: Запустить тест и убедиться, что он падает**

Run:

```bash
npm test -- tests/task-lifecycle.test.ts
```

Expected: FAIL с ошибкой чтения `trigger/queues.ts` или `trigger/padl-monitor.ts`.

- [ ] **Step 3: Создать Trigger queue и tasks**

`trigger/queues.ts`:

```ts
import { queue } from "@trigger.dev/sdk";

export const padlMonitorQueue = queue({
  name: "padl-monitor-queue",
  concurrencyLimit: 1,
});
```

`trigger/padl-state-session.ts`:

```ts
import { task } from "@trigger.dev/sdk";

export const padlStateSession = task({
  id: "padl-state-session",
  queue: padlMonitorQueue,
  run: async () => {
    return { ok: true };
  },
});
```

Добавить импорт в `trigger/padl-state-session.ts`:

```ts
import { padlMonitorQueue } from "./queues";
```

`trigger/padl-monitor.ts`:

```ts
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
```

- [ ] **Step 4: Исправить импорт в `trigger/padl-state-session.ts`, если TypeScript требует порядок импортов**

Окончательный файл:

```ts
import { task } from "@trigger.dev/sdk";
import { padlMonitorQueue } from "./queues";

export const padlStateSession = task({
  id: "padl-state-session",
  queue: padlMonitorQueue,
  run: async () => {
    return { ok: true };
  },
});
```

- [ ] **Step 5: Запустить lifecycle test**

Run:

```bash
npm test -- tests/task-lifecycle.test.ts
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add trigger/queues.ts trigger/padl-state-session.ts trigger/padl-monitor.ts tests/task-lifecycle.test.ts
git commit -m "feat: add trigger scheduled padl monitor"
```

---

### Task 13: Локальный dry-run и общая верификация

**Files:**
- Create: `src/dry-run.ts`
- Modify: `README.md`

- [ ] **Step 1: Создать локальный dry-run с моками**

`src/dry-run.ts`:

```ts
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
      return { telegramOffset: null, subscribers: { "111": { chatId: 111, firstSeenAt: "2026-07-06T12:00:00.000Z", lastStartAt: "2026-07-06T12:00:00.000Z" } } };
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
          starts: [{ starts_at: "2026-07-06T15:00:00.000Z", durations: { "60": { available_tickets: 4, is_available: true } } }],
        },
      ];
    },
  },
});
```

- [ ] **Step 2: Добавить README**

`README.md`:

```md
# PADL Telegram Bot

Trigger.dev scheduled task `padl-monitor` раз в минуту делает один короткий run: читает Telegram updates, обновляет подписчиков, получает слоты ПАДЛ, рассылает текущее состояние и сохраняет metadata в Trigger.dev Session.

## Команды

```bash
npm run verify
npm run dry-run
npm run trigger:dev
npm run trigger:deploy
```

## Env

Скопируйте `.env.example` в `.env` и задайте реальные `TRIGGER_PROJECT_REF`, `TRIGGER_SECRET_KEY` и `TELEGRAM_BOT_TOKEN`.
`TELEGRAM_GET_UPDATES_TIMEOUT_SECONDS` должен быть `0` для production.

## Ограничения

В проекте нет внешней базы данных, webhook-сервера, daemon-процесса, бесконечного Telegram polling-loop и self-trigger расписания. Повторный запуск выполняется только Trigger.dev cron schedule.
```

- [ ] **Step 3: Запустить полную верификацию**

Run:

```bash
npm run verify
npm run dry-run
```

Expected: `typecheck` и все тесты PASS; `dry-run` печатает одно Telegram-сообщение со строкой `06.07 18:00 — 4 чел. — Свободная игра`.

- [ ] **Step 4: Commit**

```bash
git add src/dry-run.ts README.md
git commit -m "docs: add dry run and usage notes"
```

---

## Ручная интеграционная проверка

- [ ] Запустить `npm run trigger:dev` с `.env`, где указан тестовый Telegram bot token.
- [ ] Отправить тестовому боту `/start`.
- [ ] Убедиться, что следующий run вызывает `getUpdates` с `timeout=0`, добавляет `chatId` в session metadata и отправляет сообщение.
- [ ] Проверить в Trigger.dev dashboard, что `padl-monitor` имеет один активный run за запуск и не держит процесс до следующей минуты.
- [ ] Выполнить один dev/staging deploy через `npm run trigger:deploy`.
- [ ] Проверить, что declarative schedule `* * * * *` привязан к `padl-monitor`.
- [ ] Проверить в логах, какой путь использовал `booking-access`: `http` или `browser`. Если browser fallback получает `TURNSTILE_TOKEN_REQUIRED`, зафиксировать полный код ошибки и DOM-состояние Turnstile в execution log, потому что это означает изменение клиентского flow сайта.

## Источники, использованные при планировании

- Trigger.dev scheduled tasks: `https://trigger.dev/docs/tasks/scheduled`
- Trigger.dev queues/concurrency: `https://trigger.dev/docs/queue-concurrency`
- Trigger.dev config file: `https://trigger.dev/docs/config/config-file`
- Trigger.dev Playwright extension: `https://trigger.dev/docs/config/extensions/playwright`
- Trigger.dev Sessions API create/retrieve/update: `https://trigger.dev/docs/management/sessions/create`, `https://trigger.dev/docs/management/sessions/retrieve`, `https://trigger.dev/docs/management/sessions/update`
- Telegram Bot API `getUpdates` и `sendMessage`: `https://core.telegram.org/bots/api`
- PADL публичный сайт: `https://outdoor.sport.mos.ru/#venues-events`
- PADL API: `https://api.outdoor.sport.mos.ru/items/venues`, `https://api.outdoor.sport.mos.ru/items/event_cards`, `https://api.outdoor.sport.mos.ru/booking/date-options`, `https://api.outdoor.sport.mos.ru/booking/availability`

## Самопроверка плана

**Покрытие спецификации:**
- Trigger.dev-only execution: Task 1, Task 9, Task 12, ручная интеграционная проверка.
- Нет внешних сервисов хранения: Task 9 хранит состояние только в Trigger.dev Session metadata.
- Только `/start`: Task 4 извлекает только `/start` и `/start payload`, остальные сообщения игнорируются.
- Env-фильтры: Task 2 и Task 6.
- Cron раз в минуту и отсутствие вечного процесса: Task 12 и `tests/task-lifecycle.test.ts`.
- `concurrency: 1`: Task 12 использует актуальный API Trigger.dev `queue({ concurrencyLimit: 1 })`.
- Telegram offset: Task 3, Task 4, Task 10.
- Рассылка всем подписчикам даже без изменений: Task 10.
- Сообщение без слотов и сообщение ошибки получения слотов: Task 5 и Task 10.
- Удаление заблокированных подписчиков: Task 4 и Task 10.
- PADL venues/event cards/booking endpoints, HTTP booking access token и browser fallback: Task 7, Task 8 и Task 11.
- Форматирование, сортировка и split длинных сообщений: Task 5.
- Логи стоимости run: Task 10.
- Минимальные unit tests из спецификации: Tasks 2-12.

**Скан на маркеры незавершенности:** проверены англоязычные маркеры незавершенной работы и расплывчатые инструкции; шаги содержат конкретный код, команды и ожидаемые результаты. Browser fallback больше не вынесен в отдельный будущий план: он является частью `booking-access` adapter и включается только по конкретным ошибкам антибот-защиты.

**Согласованность типов:** `PadlConfig`, `BotState`, `NormalizedSlot`, `PadlVenue`, `PadlEventCard` и `RawAvailabilityEvent` вводятся в Task 2 и используются с теми же именами во всех последующих задачах.
