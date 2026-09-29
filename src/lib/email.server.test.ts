import { afterEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
vi.mock("resend", () => ({
  Resend: class {
    emails = { send };
  },
}));

import { sendNotificationEmail } from "./email.server";

const email = {
  to: "test@example.com",
  type: "api_key_expiring" as const,
  subject: "API-nøkkel utløper",
  body: "Opprett en ny nøkkel.",
  url: "/bedrift",
};

afterEach(() => {
  delete process.env.RESEND_API_KEY;
  send.mockReset();
});

describe("sendNotificationEmail", () => {
  it("avviser manglende konfigurasjon og API-feil slik at varselet kan prøves igjen", async () => {
    delete process.env.RESEND_API_KEY;
    await expect(sendNotificationEmail(email)).rejects.toThrow("Missing RESEND_API_KEY");

    process.env.RESEND_API_KEY = "test-key";
    send.mockResolvedValue({ error: { message: "rate limit" } });
    await expect(sendNotificationEmail(email)).rejects.toThrow("rate limit");
  });
});
