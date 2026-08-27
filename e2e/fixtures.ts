import { test as base, expect } from "@playwright/test";
import type { Page } from "@playwright/test";

function collectBrowserErrors(page: Page) {
  const consoleErrors: string[] = [];
  const pageErrors: string[] = [];

  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => pageErrors.push(error.stack ?? error.message));

  return { consoleErrors, pageErrors };
}

export const test = base.extend({
  page: async ({ page }, fixture, testInfo) => {
    const { consoleErrors, pageErrors } = collectBrowserErrors(page);
    await fixture(page);

    const diagnostics = [
      ...consoleErrors.map((message) => `console.error: ${message}`),
      ...pageErrors.map((message) => `pageerror: ${message}`),
    ];

    if (diagnostics.length > 0) {
      await testInfo.attach("browser-errors", {
        body: Buffer.from(diagnostics.join("\n"), "utf8"),
        contentType: "text/plain",
      });
    }

    expect(diagnostics, "Nettleseren rapporterte feil").toEqual([]);
  },
});

export type { Locator } from "@playwright/test";
export { expect };
