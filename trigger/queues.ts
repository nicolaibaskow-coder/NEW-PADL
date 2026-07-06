import { queue } from "@trigger.dev/sdk";

export const padlMonitorQueue = queue({
  name: "padl-monitor-queue",
  concurrencyLimit: 1,
});
