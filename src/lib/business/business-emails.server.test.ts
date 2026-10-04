import { beforeEach, describe, expect, it, vi } from "vitest";

const sendBusinessEmail = vi.fn().mockResolvedValue(undefined);
vi.mock("@/lib/email.server", () => ({
  sendBusinessEmail: (...args: unknown[]) => sendBusinessEmail(...args),
}));

import { sendBusinessReceipt } from "./business-emails.server";

const email = { subject: "Emne", html: "<p>Hei</p>", text: "Hei" };

function admin(billingEmail: string | null) {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({
        data: table === "organization_billing_profiles" ? { billing_email: billingEmail } : null,
        error: null,
      });
      chain.then = (resolve: (v: unknown) => void) =>
        resolve({ data: [{ user_id: "u1" }], error: null });
      return chain;
    },
    auth: {
      admin: {
        getUserById: async () => ({
          data: { user: { email: "Kari@Sykkelhuset.no" } },
          error: null,
        }),
      },
    },
  } as never;
}

beforeEach(() => sendBusinessEmail.mockClear());

describe("sendBusinessReceipt", () => {
  it("sender til fakturaadressen bare når den er en annen enn superbrukerens", async () => {
    await sendBusinessReceipt(admin("kari@sykkelhuset.no"), "org-1", () => email, {
      includeBilling: true,
    });
    expect(sendBusinessEmail.mock.calls[0]![0]).toMatchObject({ to: ["Kari@Sykkelhuset.no"] });

    await sendBusinessReceipt(admin("faktura@sykkelhuset.no"), "org-1", () => email, {
      includeBilling: true,
    });
    expect(sendBusinessEmail.mock.calls[1]![0]).toMatchObject({
      to: ["Kari@Sykkelhuset.no", "faktura@sykkelhuset.no"],
    });
  });

  it("feiler aldri handlingen, selv når malen eller utsendingen feiler", async () => {
    await expect(
      sendBusinessReceipt(
        admin(null),
        "org-1",
        () => {
          throw new Error("malfeil");
        },
        { includeBilling: false },
      ),
    ).resolves.toBeUndefined();
    sendBusinessEmail.mockRejectedValueOnce(new Error("Resend nede"));
    await expect(
      sendBusinessReceipt(admin(null), "org-1", () => email, { includeBilling: false }),
    ).resolves.toBeUndefined();
  });
});
