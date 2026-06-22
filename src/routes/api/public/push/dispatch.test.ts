import { beforeEach, describe, expect, it, vi } from "vitest";

const sendNotification = vi.fn().mockResolvedValue(undefined);
const setVapidDetails = vi.fn();

vi.mock("web-push", () => ({
  default: { setVapidDetails, sendNotification },
}));

const sendNotificationEmail = vi.fn().mockResolvedValue(undefined);

vi.mock("@/lib/email.server", () => ({
  sendNotificationEmail: (...args: unknown[]) => sendNotificationEmail(...args),
}));

type Row = Record<string, unknown> | null;

function buildAdmin(opts: {
  message?: Row;
  conversation?: Row;
  profile?: Row;
  notification?: Row;
  listing?: Row;
  savedSearch?: Row;
  priceDrop?: Row;
  sold?: Row;
  prefs?: Row;
  subs?: Row[];
  userEmail?: string | null;
}) {
  const deletedSubIds: string[] = [];
  const updatedSubIds: string[] = [];

  const from = (name: string) => {
    const single = (data: Row) => ({ maybeSingle: async () => ({ data }) });

    switch (name) {
      case "messages":
        return { select: () => ({ eq: () => single(opts.message ?? null) }) };
      case "conversations":
        return { select: () => ({ eq: () => single(opts.conversation ?? null) }) };
      case "profiles":
        return { select: () => ({ eq: () => single(opts.profile ?? null) }) };
      case "saved_search_notifications":
        return { select: () => ({ eq: () => single(opts.notification ?? null) }) };
      case "listings":
        return { select: () => ({ eq: () => single(opts.listing ?? null) }) };
      case "saved_searches":
        return { select: () => ({ eq: () => single(opts.savedSearch ?? null) }) };
      case "favorite_price_drops":
        return { select: () => ({ eq: () => single(opts.priceDrop ?? null) }) };
      case "favorite_sold_notifications":
        return { select: () => ({ eq: () => single(opts.sold ?? null) }) };
      case "notification_preferences":
        return { select: () => ({ eq: () => single(opts.prefs ?? null) }) };
      case "push_subscriptions":
        return {
          select: () => ({ eq: async () => ({ data: opts.subs ?? [] }) }),
          update: (_payload: unknown) => ({
            eq: (_col: string, id: string) => {
              updatedSubIds.push(id);
              return Promise.resolve({ data: null });
            },
          }),
          delete: () => ({
            eq: (_col: string, id: string) => {
              deletedSubIds.push(id);
              return Promise.resolve({ data: null });
            },
          }),
        };
      default:
        throw new Error(`Unexpected table: ${name}`);
    }
  };

  return {
    from,
    deletedSubIds,
    updatedSubIds,
    auth: {
      admin: {
        getUserById: async (_id: string) => ({
          data: { user: opts.userEmail ? { email: opts.userEmail } : null },
        }),
      },
    },
  };
}

const supabaseAdminMock: {
  from: (name: string) => unknown;
  auth?: { admin: { getUserById: (id: string) => Promise<unknown> } };
} = {
  from: () => {
    throw new Error("supabaseAdminMock.from not configured for this test");
  },
};

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: supabaseAdminMock,
}));

function setAdmin(admin: ReturnType<typeof buildAdmin>) {
  supabaseAdminMock.from = admin.from;
  supabaseAdminMock.auth = admin.auth;
}

async function postPayload(body: unknown, secret = "test-secret") {
  const { Route } = await import("./dispatch");
  const request = new Request("http://localhost/api/public/push/dispatch", {
    method: "POST",
    headers: { "x-push-dispatch-secret": secret },
    body: JSON.stringify(body),
  });
  // @ts-expect-error server handlers are present at runtime
  return Route.options.server.handlers.POST({ request });
}

const SUB = { id: "sub-1", endpoint: "https://push.example/ep1", p256dh: "p256dh", auth: "auth" };

beforeEach(() => {
  vi.resetModules();
  sendNotification.mockClear().mockResolvedValue(undefined);
  setVapidDetails.mockClear();
  sendNotificationEmail.mockClear().mockResolvedValue(undefined);
  process.env.PUSH_DISPATCH_SECRET = "test-secret";
  process.env.VAPID_PRIVATE_KEY = "test-private-key";
});

describe("push dispatch endpoint", () => {
  it("rejects requests without the correct dispatch secret", async () => {
    setAdmin(buildAdmin({}));
    const res = await postPayload(
      { type: "message", message_id: "11111111-1111-1111-1111-111111111111" },
      "wrong",
    );
    expect(res.status).toBe(401);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("sends a push notification when the recipient gets a new chat message", async () => {
    setAdmin(
      buildAdmin({
        message: {
          id: "m1",
          sender_id: "seller-1",
          conversation_id: "conv-1",
          body: "Er den fortsatt til salgs?",
        },
        conversation: { buyer_id: "buyer-1", seller_id: "seller-1" },
        profile: { display_name: "Kari Selger" },
        prefs: {
          web_push_messages: true,
          web_push_saved_searches: true,
          web_push_price_drops: true,
        },
        subs: [SUB],
      }),
    );

    const res = await postPayload({
      type: "message",
      message_id: "11111111-1111-1111-1111-111111111111",
    });

    expect(res.status).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toContain("Kari Selger");
    expect(payload.url).toBe("/meldinger/conv-1");
  });

  it("sends a push notification when a saved search gets a new match", async () => {
    setAdmin(
      buildAdmin({
        notification: { user_id: "buyer-1", listing_id: "listing-1", saved_search_id: "ss-1" },
        listing: { title: "iPhone 15 Pro" },
        savedSearch: { name: "iPhone i Oslo" },
        prefs: {
          web_push_messages: true,
          web_push_saved_searches: true,
          web_push_price_drops: true,
        },
        subs: [SUB],
      }),
    );

    const res = await postPayload({
      type: "saved_search",
      notification_id: "22222222-2222-2222-2222-222222222222",
    });

    expect(res.status).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toContain("iPhone i Oslo");
    expect(payload.body).toBe("iPhone 15 Pro");
    expect(payload.url).toBe("/annonse/listing-1");
  });

  it("sends a push notification when a favorited listing's price drops", async () => {
    setAdmin(
      buildAdmin({
        priceDrop: {
          user_id: "buyer-1",
          listing_id: "listing-1",
          old_price_nok: 10000,
          new_price_nok: 8000,
          drop_pct: 20,
        },
        listing: { title: "iPhone 15 Pro" },
        prefs: {
          web_push_messages: true,
          web_push_saved_searches: true,
          web_push_price_drops: true,
        },
        subs: [SUB],
      }),
    );

    const res = await postPayload({
      type: "price_drop",
      price_drop_id: "33333333-3333-3333-3333-333333333333",
    });

    expect(res.status).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toContain("Prisfall");
    expect(payload.body).toContain("20%");
  });

  it("sends a push notification when a favorited listing is marked as sold", async () => {
    setAdmin(
      buildAdmin({
        sold: { user_id: "buyer-1", listing_id: "listing-1" },
        listing: { title: "iPhone 15 Pro" },
        prefs: {
          web_push_messages: true,
          web_push_saved_searches: true,
          web_push_price_drops: true,
          web_push_sold: true,
        },
        subs: [SUB],
      }),
    );

    const res = await postPayload({
      type: "sold",
      sold_notification_id: "44444444-4444-4444-4444-444444444444",
    });

    expect(res.status).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(sendNotification.mock.calls[0][1]);
    expect(payload.title).toContain("solgt");
    expect(payload.body).toContain("iPhone 15 Pro");
    expect(payload.url).toBe("/annonse/listing-1");
  });

  it("does not send a sold notification when the user disabled that notification type", async () => {
    setAdmin(
      buildAdmin({
        sold: { user_id: "buyer-1", listing_id: "listing-1" },
        listing: { title: "iPhone 15 Pro" },
        prefs: { web_push_sold: false },
        subs: [SUB],
      }),
    );

    const res = await postPayload({
      type: "sold",
      sold_notification_id: "44444444-4444-4444-4444-444444444444",
    });

    expect(res.status).toBe(204);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("does not send a notification when the user disabled that notification type", async () => {
    setAdmin(
      buildAdmin({
        priceDrop: {
          user_id: "buyer-1",
          listing_id: "listing-1",
          old_price_nok: 10000,
          new_price_nok: 8000,
          drop_pct: 20,
        },
        listing: { title: "iPhone 15 Pro" },
        prefs: {
          web_push_messages: true,
          web_push_saved_searches: true,
          web_push_price_drops: false,
        },
        subs: [SUB],
      }),
    );

    const res = await postPayload({
      type: "price_drop",
      price_drop_id: "33333333-3333-3333-3333-333333333333",
    });

    expect(res.status).toBe(204);
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it("removes a subscription that the push service reports as gone (410)", async () => {
    const err = Object.assign(new Error("gone"), { statusCode: 410 });
    sendNotification.mockRejectedValueOnce(err);

    const admin = buildAdmin({
      priceDrop: {
        user_id: "buyer-1",
        listing_id: "listing-1",
        old_price_nok: 10000,
        new_price_nok: 8000,
        drop_pct: 20,
      },
      listing: { title: "iPhone 15 Pro" },
      prefs: { web_push_price_drops: true },
      subs: [SUB],
    });
    setAdmin(admin);

    const res = await postPayload({
      type: "price_drop",
      price_drop_id: "33333333-3333-3333-3333-333333333333",
    });

    expect(res.status).toBe(200);
    expect(admin.deletedSubIds).toEqual(["sub-1"]);
  });

  it("sends an email when the user enabled email notifications for sold listings", async () => {
    setAdmin(
      buildAdmin({
        sold: { user_id: "buyer-1", listing_id: "listing-1" },
        listing: { title: "iPhone 15 Pro" },
        prefs: { web_push_sold: false, email_sold: true },
        userEmail: "buyer@example.com",
      }),
    );

    const res = await postPayload({
      type: "sold",
      sold_notification_id: "44444444-4444-4444-4444-444444444444",
    });

    expect(res.status).toBe(200);
    expect(sendNotification).not.toHaveBeenCalled();
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: "buyer@example.com", url: "/annonse/listing-1" }),
    );
  });

  it("sends both push and email when both are enabled", async () => {
    setAdmin(
      buildAdmin({
        sold: { user_id: "buyer-1", listing_id: "listing-1" },
        listing: { title: "iPhone 15 Pro" },
        prefs: { web_push_sold: true, email_sold: true },
        subs: [SUB],
        userEmail: "buyer@example.com",
      }),
    );

    const res = await postPayload({
      type: "sold",
      sold_notification_id: "44444444-4444-4444-4444-444444444444",
    });

    expect(res.status).toBe(200);
    expect(sendNotification).toHaveBeenCalledTimes(1);
    expect(sendNotificationEmail).toHaveBeenCalledTimes(1);
  });

  it("skips email when the user has no email on file", async () => {
    setAdmin(
      buildAdmin({
        sold: { user_id: "buyer-1", listing_id: "listing-1" },
        listing: { title: "iPhone 15 Pro" },
        prefs: { web_push_sold: false, email_sold: true },
        userEmail: null,
      }),
    );

    const res = await postPayload({
      type: "sold",
      sold_notification_id: "44444444-4444-4444-4444-444444444444",
    });

    expect(res.status).toBe(200);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });
});
