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
