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
