import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotificationEmail = vi.fn();
const markNotified = vi.fn();
const key = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Integrasjon",
  organization_id: "22222222-2222-4222-8222-222222222222",
  expires_at: "",
  revoked_at: null,
  expiry_notified_14_at: null as string | null,
  expiry_notified_3_at: null as string | null,
};

vi.mock("@/lib/email.server", () => ({ sendNotificationEmail }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      if (table === "organization_api_keys") {
        return {
          select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: key }) }) }),
          update: () => ({ eq: () => ({ is: markNotified }) }),
        };
      }
      if (table === "organization_members") {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ data: [{ user_id: "33333333-3333-4333-8333-333333333333" }] }),
              }),
            }),
          }),
        };
      }
      throw new Error(`Unexpected table: ${table}`);
    },
    auth: {
      admin: { getUserById: async () => ({ data: { user: { email: "test@example.com" } } }) },
    },
  },
}));

async function post() {
  const { Route } = await import("./expiry-notify");
  const request = new Request("http://localhost/api/public/api-keys/expiry-notify", {
    method: "POST",
    headers: { "x-api-key-expiry-secret": "test-secret" },
    body: JSON.stringify({ api_key_id: key.id, threshold_days: 14 }),
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request });
}

beforeEach(() => {
  process.env.API_KEY_EXPIRY_SECRET = "test-secret";
  key.expires_at = new Date(Date.now() + 7 * 86_400_000).toISOString();
  key.expiry_notified_14_at = null;
  sendNotificationEmail.mockReset();
  markNotified.mockReset().mockResolvedValue({ error: null });
});

describe("API-nøkkelens utløpsvarsel", () => {
  it("prøver igjen etter sendefeil og markerer først etter vellykket levering", async () => {
    sendNotificationEmail.mockRejectedValueOnce(new Error("Resend unavailable"));

    expect((await post()).status).toBe(503);
    expect(markNotified).not.toHaveBeenCalled();

    sendNotificationEmail.mockResolvedValueOnce(undefined);
    expect((await post()).status).toBe(204);
    expect(markNotified).toHaveBeenCalledOnce();
  });

  it("sender ikke samme varsel på nytt når nøkkelen allerede er varslet", async () => {
    key.expiry_notified_14_at = new Date().toISOString();

    expect((await post()).status).toBe(204);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
    expect(markNotified).not.toHaveBeenCalled();
  });
});
