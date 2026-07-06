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
