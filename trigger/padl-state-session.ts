import { task } from "@trigger.dev/sdk";
import { padlMonitorQueue } from "./queues";

export const padlStateSession = task({
  id: "padl-state-session",
  queue: padlMonitorQueue,
  run: async () => {
    return { ok: true };
  },
});
