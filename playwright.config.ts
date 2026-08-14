import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT ?? 8080);
const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  snapshotPathTemplate: "{testDir}/{testFilePath}-snapshots/{arg}-{projectName}{ext}",
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  globalTeardown: "./e2e/global-teardown.ts",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "desktop-web",
      testIgnore: /.*\.visual\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "mobile-web",
      testIgnore: /.*\.visual\.spec\.ts/,
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "visual-web",
      testMatch: /.*\.visual\.spec\.ts/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "visual-phone",
      testMatch: /.*\.visual\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
      },
    },
    {
      name: "visual-landscape",
      testMatch: /.*\.visual\.spec\.ts/,
      use: {
        ...devices["iPhone 13"],
        browserName: "chromium",
        viewport: { width: 844, height: 390 },
      },
    },
    {
      name: "visual-tablet",
      testMatch: /.*\.visual\.spec\.ts/,
      use: {
        ...devices["iPad (gen 7)"],
        browserName: "chromium",
        viewport: { width: 820, height: 1180 },
      },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: `bun run dev -- --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 60_000,
      },
});
