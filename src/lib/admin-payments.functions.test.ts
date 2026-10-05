import { beforeEach, describe, expect, it, vi } from "vitest";

type Result = { data?: unknown; error?: unknown };

const s = vi.hoisted(() => ({
  host: "kaupet.no" as string | null,
  requireAdmin: vi.fn(),
  refundVippsPayment: vi.fn(),
  getVippsPayment: vi.fn(),
  logServerError: vi.fn(),
  sendReceipt: vi.fn(),
  queues: {} as Record<string, Result[]>,
  ops: [] as { table: string; op: string; values?: unknown; filters: unknown[][] }[],
  context: { supabase: {}, userId: "admin-1" } as unknown,
}));

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, { client: (c: (...args: unknown[]) => unknown) => c }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown; context: unknown }) => unknown) | undefined;
    const fn = (input: { data?: unknown } = {}) =>
      handler!({ data: validator(input.data), context: s.context });
    Object.assign(fn, {
      middleware: () => fn,
      validator: (v: typeof validator) => ((validator = v), fn),
      handler: (h: typeof handler) => ((handler = h), fn),
    });
    return fn;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({
  getRequest: () => ({ headers: { get: () => s.host } }),
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/admin-auth.server", () => ({ requireAdminRole: s.requireAdmin }));
vi.mock("@/lib/server-error-log", () => ({ logServerError: s.logServerError }));
vi.mock("@/lib/business/business-emails.server", () => ({ sendBusinessReceipt: s.sendReceipt }));
vi.mock("@/lib/vipps.server", async (importActual) => ({
  vippsPaymentStatus: (await importActual<typeof import("@/lib/vipps.server")>())
    .vippsPaymentStatus,
  refundVippsPayment: s.refundVippsPayment,
  getVippsPayment: s.getVippsPayment,
}));

function next(key: string): Result {
  const r = s.queues[key]?.shift();
  if (!r) throw new Error(`Ingen mock-resultat igjen for ${key}`);
  return { data: null, error: null, ...r };
}

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: (table: string) => {
      const op = { table, op: "select", values: undefined as unknown, filters: [] as unknown[][] };
      s.ops.push(op);
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "order", "limit"]) chain[m] = () => chain;
      for (const m of ["eq", "in", "is"]) {
        chain[m] = (...args: unknown[]) => (op.filters.push([m, ...args]), chain);
      }
      for (const m of ["insert", "update"]) {
        chain[m] = (values: unknown) => ((op.op = m), (op.values = values), chain);
      }
      chain.maybeSingle = async () => next(table);
      chain.single = async () => next(table);
      chain.then = (resolve: (v: unknown) => void) => resolve(next(table));
      return chain;
    },
    rpc: (name: string) => ({ single: async () => next(`rpc:${name}`) }),
  },
}));

import { isAlreadyLogged } from "@/lib/to-client-error";
import {
  adminCancelProffOrder,
  adminEndProffAgreement,
  adminMarkProffOrderPaid,
  adminRegisterProffInvoiceSent,
  adminRegisterProffReminder,
} from "./admin-proff.functions";
import {
  adminGetVippsPaymentStatus,
  adminGiftPromotion,
  adminRefundPromotion,
} from "./admin-promotions.functions";

const id = "22222222-2222-4222-8222-222222222222";
const listingId = "11111111-1111-4111-8111-111111111111";
const dbError = { code: "XX000", message: "intern db-feil" };
const GENERIC = "Noe gikk galt. Prøv igjen senere.";

const rejection = async (p: Promise<unknown>) => {
  try {
    await p;
  } catch (e) {
    return e as Error & { status?: number };
  }
  throw new Error("forventet avvisning");
};
const ops = (table: string, op: string) => s.ops.filter((o) => o.table === table && o.op === op);

beforeEach(() => {
  s.host = "kaupet.no";
  s.queues = {};
  s.ops = [];
  s.requireAdmin.mockReset().mockResolvedValue(undefined);
  s.refundVippsPayment.mockReset().mockResolvedValue(undefined);
  s.getVippsPayment.mockReset();
  s.logServerError.mockReset().mockResolvedValue(undefined);
  s.sendReceipt.mockReset().mockResolvedValue(undefined);
});

describe("admin-proff: fakturering, betaling og kansellering", () => {
  it("avviser ikke-admin før noen databaseoperasjon", async () => {
    s.requireAdmin.mockRejectedValue(new Error("Ikke autorisert"));
    for (const call of [
      () =>
        adminRegisterProffInvoiceSent({
          data: { orderId: id, fikenInvoiceNumber: "1", sentOn: "2026-10-01", dueOn: "2026-10-20" },
        }),
      () => adminRegisterProffReminder({ data: { orderId: id, sentOn: "2026-10-21" } }),
      () => adminMarkProffOrderPaid({ data: { orderId: id, paidOn: "2026-10-04" } }),
      () => adminCancelProffOrder({ data: { orderId: id } }),
    ]) {
      expect((await rejection(call())).message).toBe("Ikke autorisert");
    }
    expect(s.ops).toEqual([]);
  });

  describe("adminRegisterProffInvoiceSent", () => {
    const run = () =>
      adminRegisterProffInvoiceSent({
        data: {
          orderId: id,
          fikenInvoiceNumber: " 42 ",
          sentOn: "2026-10-01",
          dueOn: "2026-10-20",
        },
      });

    it("registrerer fakturanummer, sendt dato og forfall på bestillinger som ikke er sendt", async () => {
      s.queues.proff_orders = [{ data: { id } }];
      await expect(run()).resolves.toEqual({ ok: true });
      const [op] = ops("proff_orders", "update");
      expect(op.values).toEqual({
        status: "invoiced",
        fiken_invoice_number: "42",
        invoice_sent_on: "2026-10-01",
        invoice_due_on: "2026-10-20",
      });
      expect(op.filters).toContainEqual(["eq", "status", "pending"]);
    });

    it("avviser forfall før sendt dato uten databasekall", async () => {
      await expect(async () =>
        adminRegisterProffInvoiceSent({
          data: { orderId: id, fikenInvoiceNumber: "1", sentOn: "2026-10-20", dueOn: "2026-10-01" },
        }),
      ).rejects.toThrow();
      expect(s.ops).toEqual([]);
    });

    it("oppretter neste periode fra der betalt tilgang slutter", async () => {
      s.queues.organizations = [{ data: { proff_access_until: "2026-11-03T10:00:00.000Z" } }];
      s.queues.organization_billing_profiles = [{ data: { billing_email: "f@example.com" } }];
      s.queues.proff_orders = [{ data: null }];
      await adminRegisterProffInvoiceSent({
        data: {
          organizationId: id,
          term: "yearly",
          fikenInvoiceNumber: "43",
          sentOn: "2026-10-01",
          dueOn: "2026-11-03",
        },
      });
      const [op] = ops("proff_orders", "insert");
      expect(op.values).toMatchObject({
        status: "invoiced",
        term: "yearly",
        price_ex_vat_nok: 16092,
        billing_email: "f@example.com",
        period_start: "2026-11-03T10:00:00.000Z",
        period_end: "2027-11-03T10:00:00.000Z",
      });
    });

    it("409 når bestillingen ikke lenger er til fakturering", async () => {
      s.queues.proff_orders = [{ data: null }];
      expect(await rejection(run())).toMatchObject({
        message: "Bestillingen er ikke lenger til fakturering.",
        status: 409,
      });
    });

    it("maskerer databasefeil", async () => {
      s.queues.proff_orders = [{ error: dbError }];
      expect((await rejection(run())).message).toBe(GENERIC);
    });
  });

  describe("adminMarkProffOrderPaid", () => {
    const payment = {
      organization_id: "org-1",
      term: "yearly",
      fiken_invoice_number: "77",
      first_period: true,
      period_start: "2099-01-01",
      period_end: "2100-01-01",
    };
    const run = () => adminMarkProffOrderPaid({ data: { orderId: id, paidOn: "2026-10-04" } });
    beforeEach(() => {
      s.queues.organizations = [{ data: { display_name: "Eksempel", legal_name: "Eksempel AS" } }];
    });

    it("avviser en betaling som allerede er registrert", async () => {
      s.queues["rpc:mark_proff_order_paid"] = [{ error: { message: "order_not_payable" } }];
      expect(await rejection(run())).toMatchObject({
        message: "Bestillingen er allerede registrert betalt eller kansellert.",
        status: 409,
      });
      expect(s.sendReceipt).not.toHaveBeenCalled();
    });

    it("maskerer transaksjonsfeil og sender ingen kvittering", async () => {
      s.queues["rpc:mark_proff_order_paid"] = [{ error: dbError }];
      expect((await rejection(run())).message).toBe(GENERIC);
      expect(s.sendReceipt).not.toHaveBeenCalled();
    });

    it("returnerer den lagrede perioden og bekrefter første betaling", async () => {
      s.queues["rpc:mark_proff_order_paid"] = [{ data: payment }];
      await expect(run()).resolves.toEqual({
        ok: true,
        periodStart: "2099-01-01",
        periodEnd: "2100-01-01",
      });
      const [, , buildEmail] = s.sendReceipt.mock.calls[0]!;
      expect(buildEmail().subject).toBe("Betalingen er mottatt – Kaupet Proff er aktivt");
    });

    it("sender ikke kvittering for fornyelse når bedriften ikke har valgt det", async () => {
      s.queues["rpc:mark_proff_order_paid"] = [{ data: { ...payment, first_period: false } }];
      s.queues.organization_billing_profiles = [{ data: { payment_receipts: false } }];
      await run();
      expect(s.sendReceipt).not.toHaveBeenCalled();
    });

    it("sender valgt kvittering for fornyelse", async () => {
      s.queues["rpc:mark_proff_order_paid"] = [{ data: { ...payment, first_period: false } }];
      s.queues.organization_billing_profiles = [{ data: { payment_receipts: true } }];
      await run();
      const [, , buildEmail] = s.sendReceipt.mock.calls[0]!;
      expect(buildEmail().subject).toBe("Betaling mottatt for Kaupet Proff");
    });
  });

  describe("adminEndProffAgreement", () => {
    const org = {
      display_name: "Eksempel",
      legal_name: "Eksempel AS",
      proff_access_until: "2099-01-01T00:00:00.000Z",
      proff_subscription_cancelled_at: null,
    };
    const run = (note?: string) => adminEndProffAgreement({ data: { organizationId: id, note } });

    it("kansellerer åpne fakturaer, stopper fornyelse og lar tilgangen stå", async () => {
      s.queues.organizations = [{ data: org }, { data: null }];
      s.queues.proff_orders = [
        {
          data: [
            {
              status: "cancelled",
              fiken_invoice_number: "10009",
              invoice_sent_on: "2020-01-01",
              invoice_due_on: "2020-01-15",
            },
          ],
        },
      ];
      s.queues.admin_events = [{ data: null }];
      s.queues.admin_moderation_log = [{ data: null }];

      await expect(run("Ubetalt etter purring")).resolves.toEqual({
        ok: true,
        accessUntil: org.proff_access_until,
      });

      const [orders] = ops("proff_orders", "update");
      expect(orders.values).toEqual({ status: "cancelled", admin_note: "Ubetalt etter purring" });
      expect(orders.filters).toContainEqual(["in", "status", ["pending", "invoiced"]]);
      const [orgUpdate] = ops("organizations", "update");
      expect(orgUpdate.values).toMatchObject({
        proff_ended_by_kaupet_at: expect.any(String),
        proff_subscription_cancelled_at: expect.any(String),
      });
      expect(orgUpdate.values).not.toHaveProperty("proff_access_until");

      const [, , buildEmail, options] = s.sendReceipt.mock.calls[0]!;
      const email = buildEmail();
      expect(options).toEqual({ includeBilling: true });
      expect(email.subject).toBe("Kaupet Proff er avsluttet");
      expect(email.text).toContain("ikke mottatt betaling for faktura 10009");
      expect(email.text).toContain("kreditnota for faktura 10009");
      // Notatet er internt.
      expect(email.text).not.toContain("purring");
    });

    it("bruker nøytral tekst når ingen faktura har forfalt", async () => {
      s.queues.organizations = [{ data: org }, { data: null }];
      s.queues.proff_orders = [{ data: [] }];
      s.queues.admin_events = [{ data: null }];
      s.queues.admin_moderation_log = [{ data: null }];
      await run();
      const email = s.sendReceipt.mock.calls[0]![2]();
      expect(email.text).toContain("Kaupet har avsluttet Proff-avtalen for Eksempel.");
      expect(email.text).not.toContain("kreditnota");
    });
  });

  describe("adminCancelProffOrder", () => {
    it("kansellerer bare pending/invoiced og lagrer notat", async () => {
      s.queues.proff_orders = [{ data: { id } }];
      await expect(
        adminCancelProffOrder({ data: { orderId: id, note: " feil kunde " } }),
      ).resolves.toEqual({
        ok: true,
      });
      const [op] = ops("proff_orders", "update");
      expect(op.values).toEqual({ status: "cancelled", admin_note: "feil kunde" });
      expect(op.filters).toContainEqual(["in", "status", ["pending", "invoiced"]]);
    });

    it("lagrer tomt notat som null", async () => {
      s.queues.proff_orders = [{ data: { id } }];
      await adminCancelProffOrder({ data: { orderId: id, note: "  " } });
      expect(ops("proff_orders", "update")[0].values).toMatchObject({ admin_note: null });
    });

    it("409 når bestillingen ikke kan kanselleres", async () => {
      s.queues.proff_orders = [{ data: null }];
      expect(await rejection(adminCancelProffOrder({ data: { orderId: id } }))).toMatchObject({
        message: "Bestillingen kan ikke kanselleres.",
        status: 409,
      });
    });

    it("maskerer databasefeil", async () => {
      s.queues.proff_orders = [{ error: dbError }];
      expect((await rejection(adminCancelProffOrder({ data: { orderId: id } }))).message).toBe(
        GENERIC,
      );
    });
  });
});

describe("adminRefundPromotion", () => {
  const promo = {
    id,
    price_nok: 49,
    vipps_reference: "ref-1",
    vipps_mode: "production",
    status: "active",
    is_gift: false,
  };
  const run = () => adminRefundPromotion({ data: { promotion_id: id } });

  it("avviser ikke-admin uten Vipps-kall", async () => {
    s.requireAdmin.mockRejectedValue(new Error("Ikke autorisert"));
    expect((await rejection(run())).message).toBe("Ikke autorisert");
    expect(s.refundVippsPayment).not.toHaveBeenCalled();
    expect(s.ops).toEqual([]);
  });

  it("404 når fremhevingen ikke finnes", async () => {
    s.queues.listing_promotions = [{ data: null }];
    expect(await rejection(run())).toMatchObject({ message: "Fant ikke fremheving", status: 404 });
  });

  it("maskerer databasefeil ved oppslag", async () => {
    s.queues.listing_promotions = [{ error: dbError }];
    expect((await rejection(run())).message).toBe(GENERIC);
  });

  it("409: gratis fremheving kan ikke refunderes", async () => {
    s.queues.listing_promotions = [{ data: { ...promo, is_gift: true } }];
    expect(await rejection(run())).toMatchObject({
      message: "Gratis fremheving kan ikke refunderes",
      status: 409,
    });
    expect(s.refundVippsPayment).not.toHaveBeenCalled();
  });

  it("409: mangler Vipps-referanse", async () => {
    s.queues.listing_promotions = [{ data: { ...promo, vipps_reference: null } }];
    expect(await rejection(run())).toMatchObject({
      message: "Mangler Vipps-referanse",
      status: 409,
    });
    expect(s.refundVippsPayment).not.toHaveBeenCalled();
  });

  it("400: allerede refundert", async () => {
    s.queues.listing_promotions = [{ data: { ...promo, status: "refunded" } }];
    expect(await rejection(run())).toMatchObject({ message: "Allerede refundert", status: 400 });
    expect(s.refundVippsPayment).not.toHaveBeenCalled();
  });

  it("refunderer full pris i Vipps med lagret modus, markerer refundert og skriver revisjonslogg", async () => {
    s.queues.listing_promotions = [{ data: promo }, { data: null }];
    s.queues.admin_moderation_log = [{ data: null }];
    await expect(run()).resolves.toEqual({ ok: true });
    expect(s.refundVippsPayment).toHaveBeenCalledExactlyOnceWith(
      "ref-1",
      49,
      "r-22222222222242228222222222222222",
      "kaupet.no",
      "production",
    );
    expect(ops("listing_promotions", "update")[0].values).toMatchObject({
      status: "refunded",
      refunded_at: expect.any(String),
    });
    expect(ops("admin_moderation_log", "insert")[0].values).toEqual({
      admin_id: "admin-1",
      action: "refund_promotion",
      target_type: "promotion",
      target_id: id,
    });
  });

  it("bruker samme idempotency-nøkkel ved gjentatte kall (dobbeltklikk)", async () => {
    s.queues.listing_promotions = [
      { data: promo },
      { data: null },
      { data: promo },
      { data: null },
    ];
    s.queues.admin_moderation_log = [{ data: null }, { data: null }];
    const now = vi.spyOn(Date, "now");
    now.mockReturnValue(1_000);
    await run();
    now.mockReturnValue(2_000);
    await run();
    now.mockRestore();
    const keys = s.refundVippsPayment.mock.calls.map((call: unknown[]) => call[2]);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
  });

  it("endrer ikke databasen når Vipps-refusjonen feiler", async () => {
    s.queues.listing_promotions = [{ data: promo }];
    s.refundVippsPayment.mockRejectedValue(new Error("Vipps refund feilet: 409"));
    await expect(run()).rejects.toThrow("Vipps refund feilet: 409");
    expect(ops("listing_promotions", "update")).toEqual([]);
    expect(ops("admin_moderation_log", "insert")).toEqual([]);
  });

  it("kaster kontrollert feil og hopper over revisjonslogg når statusoppdatering feiler etter refusjon", async () => {
    s.queues.listing_promotions = [{ data: promo }, { error: dbError }];
    const e = await rejection(run());
    expect(e).toMatchObject({
      message: expect.stringContaining("Refusjonen er gjennomført i Vipps"),
      status: 500,
    });
    expect(isAlreadyLogged(e)).toBe(true);
    expect(s.refundVippsPayment).toHaveBeenCalledTimes(1);
    expect(s.logServerError).toHaveBeenCalledWith("refundPromotion.updateStatus", dbError, {
      promotion_id: id,
    });
    expect(ops("admin_moderation_log", "insert")).toEqual([]);
  });

  it("logger (og lykkes) når bare revisjonsloggen feiler etter refusjon", async () => {
    s.queues.listing_promotions = [{ data: promo }, { data: null }];
    s.queues.admin_moderation_log = [{ error: dbError }];
    await expect(run()).resolves.toEqual({ ok: true });
    expect(s.logServerError).toHaveBeenCalledWith("refundPromotion.moderationLog", dbError, {
      promotion_id: id,
    });
  });
});

describe("adminGiftPromotion", () => {
  const input = { listing_id: listingId, duration_days: 7, reason: " Kampanje " };
  const run = () => adminGiftPromotion({ data: input });
  const listing = { id: listingId, seller_id: "seller-1", status: "active" };

  it("404 når annonsen ikke finnes", async () => {
    s.queues.listings = [{ data: null }];
    expect(await rejection(run())).toMatchObject({ message: "Annonsen finnes ikke", status: 404 });
  });

  it("409 når annonsen ikke er aktiv", async () => {
    s.queues.listings = [{ data: { ...listing, status: "sold" } }];
    expect(await rejection(run())).toMatchObject({
      message: "Annonsen må være aktiv",
      status: 409,
    });
  });

  it("409 når annonsen allerede har fremheving", async () => {
    s.queues.listings = [{ data: listing }];
    s.queues.listing_promotions = [{ data: { id: "x" } }];
    expect(await rejection(run())).toMatchObject({
      message: "Annonsen har allerede en aktiv fremheving",
      status: 409,
    });
    expect(ops("listing_promotions", "insert")).toEqual([]);
  });

  it("gir gratis fremheving til selgeren og logger handlingen", async () => {
    s.queues.listings = [{ data: listing }];
    s.queues.listing_promotions = [{ data: null }, { data: null }];
    s.queues.admin_moderation_log = [{ data: null }];
    await expect(run()).resolves.toEqual({ ok: true });
    expect(ops("listing_promotions", "insert")[0].values).toMatchObject({
      user_id: "seller-1",
      price_nok: 0,
      status: "gifted",
      is_gift: true,
      gift_reason: "Kampanje",
      granted_by: "admin-1",
    });
    expect(ops("admin_moderation_log", "insert")[0].values).toMatchObject({
      action: "gift_promotion",
      target_id: listingId,
      reason: "7 dager — Kampanje",
    });
  });

  it("maskerer feil ved innsetting og logger bare ved loggfeil", async () => {
    s.queues.listings = [{ data: listing }];
    s.queues.listing_promotions = [{ data: null }, { error: dbError }];
    expect((await rejection(run())).message).toBe(GENERIC);

    s.queues.listings = [{ data: listing }];
    s.queues.listing_promotions = [{ data: null }, { data: null }];
    s.queues.admin_moderation_log = [{ error: dbError }];
    await expect(run()).resolves.toEqual({ ok: true });
    expect(s.logServerError).toHaveBeenCalledWith("adminGiftPromotion.moderationLog", dbError, {
      listing_id: listingId,
    });
  });
});

describe("adminGetVippsPaymentStatus", () => {
  const base = {
    id,
    status: "active",
    price_nok: 49,
    vipps_reference: "ref-1",
    vipps_mode: "test",
    is_gift: false,
  };
  const run = () => adminGetVippsPaymentStatus({ data: { promotion_id: id } });

  it("404 når fremhevingen ikke finnes", async () => {
    s.queues.listing_promotions = [{ data: null }];
    expect(await rejection(run())).toMatchObject({ message: "Fant ikke fremheving", status: 404 });
  });

  it.each([
    ["gave", { is_gift: true }],
    ["manglende referanse", { vipps_reference: null }],
  ])("%s: ingen Vipps-oppslag", async (_n, patch) => {
    s.queues.listing_promotions = [{ data: { ...base, ...patch } }];
    await expect(run()).resolves.toEqual({ hasVipps: false });
    expect(s.getVippsPayment).not.toHaveBeenCalled();
  });

  // ePayment beholder `state: "AUTHORIZED"`; capture/refusjon/kansellering
  // står bare i aggregate, og admin skal vise den utledede statusen.
  const nok = (value: number) => ({ value, currency: "NOK" });
  const captured = { capturedAmount: nok(4900) };
  const refunded = { capturedAmount: nok(4900), refundedAmount: nok(4900) };
  const cancelled = { cancelledAmount: nok(4900) };
  it.each([
    ["AUTHORIZED", captured, "pending", "CAPTURED", true],
    ["AUTHORIZED", {}, "failed", "AUTHORIZED", true],
    ["AUTHORIZED", captured, "active", "CAPTURED", false],
    ["AUTHORIZED", refunded, "active", "REFUNDED", true],
    ["AUTHORIZED", refunded, "refunded", "REFUNDED", false],
    ["AUTHORIZED", cancelled, "active", "CANCELLED", true],
    ["ABORTED", undefined, "failed", "ABORTED", false],
  ])(
    "%s %o mot status %s: viser %s, mismatch=%s",
    async (state, aggregate, status, shown, mismatch) => {
      s.queues.listing_promotions = [{ data: { ...base, status } }];
      s.getVippsPayment.mockResolvedValue({
        state,
        aggregate,
        pspReference: "psp",
        amount: { value: 4900, currency: "NOK" },
      });
      await expect(run()).resolves.toMatchObject({
        hasVipps: true,
        state: shown,
        mismatch,
        amountNok: 49,
        mode: "test",
      });
      expect(s.getVippsPayment).toHaveBeenCalledWith("ref-1", "kaupet.no", "test");
    },
  );

  it("returnerer feilmelding i stedet for å kaste når Vipps feiler", async () => {
    s.queues.listing_promotions = [{ data: base }];
    s.getVippsPayment.mockRejectedValue(new Error("Vipps get-payment feilet: 500"));
    await expect(run()).resolves.toEqual({
      hasVipps: true,
      mode: "test",
      reference: "ref-1",
      error: "Vipps get-payment feilet: 500",
    });
  });
});
