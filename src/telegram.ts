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
