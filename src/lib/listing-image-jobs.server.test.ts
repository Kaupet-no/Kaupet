import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ImageDecodeError,
  ImagesUnavailableError,
  type ImageTransformer,
} from "@/lib/image-compression.server";
import {
  CustomerImageError,
  processListingImageJob,
  type ListingImageJobRow,
} from "@/lib/listing-image-jobs.server";
import { putObject } from "@/lib/r2.server";

vi.mock("@/lib/r2.server", () => ({
  putObject: vi.fn(async () => {
    uploadEvents.push("put");
  }),
}));

const uploadEvents: string[] = [];

const JPEG_MAGIC = new Uint8Array([0xff, 0xd8, 0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

function jpegResponse(
  init: { status?: number; headers?: Record<string, string>; body?: Uint8Array } = {},
) {
  const body = init.body ?? JPEG_MAGIC;
  return new Response(body as BodyInit, {
    status: init.status ?? 200,
    headers: { "content-type": "image/jpeg", ...init.headers },
  });
}

function job(overrides: Partial<ListingImageJobRow> = {}): ListingImageJobRow {
  return {
    id: "job-1",
    organization_id: "org-1",
    listing_id: "11111111-1111-1111-1111-111111111111",
    source_url: "https://example.com/a.jpg",
    sort_order: 0,
    status: "processing",
    attempts: 1,
    next_attempt_at: new Date().toISOString(),
    customer_error: null,
    internal_error: null,
    storage_path: null,
    content_hash: null,
    transformations: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  } as ListingImageJobRow;
}

function fakeTransformer(bytes = new Uint8Array(100)): ImageTransformer {
  return { transform: vi.fn().mockResolvedValue({ bytes, contentType: "image/webp" }) };
}

function buildAdmin(options: { registrationError?: Error; insertError?: Error } = {}) {
  const updates: Array<{ table: string; payload: unknown }> = [];
  const registered: string[] = [];
  const admin = {
    rpc: (name: string, args: { _key: string }) => {
      uploadEvents.push(name);
      if (name === "register_standard_upload_object") {
        registered.push(args._key);
        return Promise.resolve({ data: null, error: options.registrationError ?? null });
      }
      throw new Error(`unexpected RPC: ${name}`);
    },
    from: (table: string) => ({
      insert: (payload: unknown) => {
        uploadEvents.push("insert");
        return Promise.resolve({ data: null, error: options.insertError ?? null, payload, table });
      },
      update: (payload: unknown) => ({
        eq: () => {
          updates.push({ table, payload });
          return Promise.resolve({ data: null, error: null });
        },
      }),
    }),
  };
  return { admin, updates, registered };
}

describe("processListingImageJob", () => {
  beforeEach(() => vi.stubEnv("EXTERNAL_IMAGE_ALLOWED_HOSTS", "example.com"));
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    uploadEvents.length = 0;
  });

  it("lagrer bildet og markerer jobben 'done' ved suksess", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jpegResponse());
    const { admin, updates } = buildAdmin();

    const result = await processListingImageJob(job(), {
      supabaseAdmin: admin as never,
      transformer: fakeTransformer(),
      fetchImpl,
    });

    expect(result.outcome).toBe("done");
    const doneUpdate = updates.find((u) => u.table === "listing_image_jobs");
    expect(doneUpdate?.payload).toMatchObject({
      status: "done",
      customer_error: null,
      internal_error: null,
    });
    expect(uploadEvents.indexOf("register_standard_upload_object")).toBeLessThan(
      uploadEvents.indexOf("put"),
    );
    expect(
      uploadEvents.filter((event) => event === "register_standard_upload_object"),
    ).toHaveLength(2);
  });

  it("registreringsfeil gir retry uten å skrive noen objekter", async () => {
    const { admin } = buildAdmin({ registrationError: new Error("database nede") });
    const result = await processListingImageJob(job(), {
      supabaseAdmin: admin as never,
      transformer: fakeTransformer(),
      fetchImpl: vi.fn().mockResolvedValue(jpegResponse()),
    });
    expect(result.outcome).toBe("retry_pending");
    expect(uploadEvents).not.toContain("put");
  });

  it("lar registrerte objekter stå når metadataregistrering feiler", async () => {
    const { admin, registered } = buildAdmin({ insertError: new Error("database nede") });
    const result = await processListingImageJob(job(), {
      supabaseAdmin: admin as never,
      transformer: fakeTransformer(),
      fetchImpl: vi.fn().mockResolvedValue(jpegResponse()),
    });
    expect(result.outcome).toBe("retry_pending");
    expect(registered).toHaveLength(2);
    expect(uploadEvents.filter((event) => event === "put")).toHaveLength(2);
    expect(uploadEvents.indexOf("insert")).toBeGreaterThan(uploadEvents.lastIndexOf("put"));
  });

  describe("kundefeil (status failed, customer_error, ingen internal_error)", () => {
    it.each([
      [404, "Bildet finnes ikke på adressen (HTTP 404)."],
      [410, "Bildet finnes ikke på adressen (HTTP 410)."],
      [403, "Adressen svarte med feil (HTTP 403)."],
    ])("HTTP %s gir kundefeil %s", async (status, expectedMessage) => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse({ status }));
      const { admin, updates } = buildAdmin();

      const result = await processListingImageJob(job(), {
        supabaseAdmin: admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result).toMatchObject({ outcome: "customer_failed", message: expectedMessage });
      const update = updates.find((u) => u.table === "listing_image_jobs");
      expect(update?.payload).toMatchObject({
        status: "failed",
        customer_error: expectedMessage,
        internal_error: null,
      });
    });

    it("feil content-type/magiske bytes gir 'Adressen svarer ikke med et bilde.'", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          new Response("<html></html>", { status: 200, headers: { "content-type": "text/html" } }),
        );

      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result).toMatchObject({
        outcome: "customer_failed",
        message: "Adressen svarer ikke med et bilde.",
      });
    });

    it("bilde over 20 MB gir 'Bildet er større enn 20 MB.'", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValue(
          jpegResponse({ headers: { "content-length": String(21 * 1024 * 1024) } }),
        );

      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result).toMatchObject({
        outcome: "customer_failed",
        message: "Bildet er større enn 20 MB.",
      });
    });

    it("ikke-https omdirigering avvises som 'Adressen svarer ikke med et bilde.'", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: "http://example.com/a.jpg" } }),
        );

      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result).toMatchObject({
        outcome: "customer_failed",
        message: "Adressen svarer ikke med et bilde.",
      });
    });

    it.each([
      "http://example.com/a.jpg",
      "https://user@example.com/a.jpg",
      "https://example.com:8443/a.jpg",
      "https://127.0.0.1/a.jpg",
      "https://2130706433/a.jpg",
      "https://0x7f000001/a.jpg",
      "https://service.localhost/a.jpg",
      "https://example.com/a.jpg#fragment",
      "https://example.org/a.jpg",
      "https://example.com/a\n.jpg",
      "https://example.com\\@127.0.0.1/a.jpg",
      "https://%65xample.com/a.jpg",
    ])(
      "avviser utrygg eller ikke-godkjent startadresse: %s uten å hente den",
      async (sourceUrl) => {
        const fetchImpl = vi.fn();
        const result = await processListingImageJob(job({ source_url: sourceUrl }), {
          supabaseAdmin: buildAdmin().admin as never,
          transformer: fakeTransformer(),
          fetchImpl,
        });

        expect(result.outcome).toBe("customer_failed");
        expect(fetchImpl).not.toHaveBeenCalled();
      },
    );

    it("avviser omdirigering til en ikke-godkjent vert før det andre nettverkskallet", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: "https://127.0.0.1/private" } }),
        );
      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result.outcome).toBe("customer_failed");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("følger en relativ omdirigering på godkjent vert", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 302, headers: { location: "/b.jpg" } }))
        .mockResolvedValueOnce(jpegResponse());
      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result.outcome).toBe("done");
      expect(fetchImpl).toHaveBeenNthCalledWith(
        2,
        "https://example.com/b.jpg",
        expect.objectContaining({ redirect: "manual" }),
      );
      expect(fetchImpl.mock.calls[0][1]?.signal).toBe(fetchImpl.mock.calls[1][1]?.signal);
    });

    it("klassifiserer feilformatert Location som kundefeil", async () => {
      const fetchImpl = vi
        .fn()
        .mockResolvedValueOnce(
          new Response(null, { status: 302, headers: { location: "https://%zz" } }),
        );
      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result.outcome).toBe("customer_failed");
      expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    it("dekodefeil fra transformeren gir 'Bildet kunne ikke leses (skadet fil).'", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse());
      const transformer: ImageTransformer = {
        transform: vi.fn().mockRejectedValue(new ImageDecodeError()),
      };

      const result = await processListingImageJob(job(), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer,
        fetchImpl,
      });

      expect(result).toMatchObject({
        outcome: "customer_failed",
        message: "Bildet kunne ikke leses (skadet fil).",
      });
    });
  });

  describe("interne feil (status pending igjen med backoff, ingen customer_error)", () => {
    it("timer ut under en hengende body og gjør ingen R2-skriving", async () => {
      vi.useFakeTimers();
      const cancelled = vi.fn();
      const fetchImpl = vi.fn().mockResolvedValue(
        new Response(
          new ReadableStream<Uint8Array>({
            start(controller) {
              controller.enqueue(JPEG_MAGIC);
            },
            cancel: cancelled,
          }),
          { headers: { "content-type": "image/jpeg" } },
        ),
      );
      const { admin, updates } = buildAdmin();

      const pending = processListingImageJob(job(), {
        supabaseAdmin: admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });
      await Promise.resolve();
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(15_000);

      expect(await pending).toMatchObject({ outcome: "retry_pending", jobId: "job-1" });
      expect(fetchImpl.mock.calls[0][1]?.signal?.aborted).toBe(true);
      expect(cancelled).toHaveBeenCalledTimes(1);
      expect(putObject).not.toHaveBeenCalled();
      const update = updates.find((u) => u.table === "listing_image_jobs")?.payload as
        { status?: string; customer_error?: unknown } | undefined;
      expect(update?.status).toBe("pending");
      expect(update?.customer_error).toBeUndefined();
    });

    it.each(["", "127.0.0.1", "*.example.com", "example.com:8443"])(
      "manglende eller ugyldig vertspolicy (%s) gir retry uten å hente kildeadressen",
      async (policy) => {
        vi.stubEnv("EXTERNAL_IMAGE_ALLOWED_HOSTS", policy);
        const fetchImpl = vi.fn();
        const { admin, updates } = buildAdmin();

        const result = await processListingImageJob(job(), {
          supabaseAdmin: admin as never,
          transformer: fakeTransformer(),
          fetchImpl,
        });

        expect(result.outcome).toBe("retry_pending");
        expect(fetchImpl).not.toHaveBeenCalled();
        expect(updates[0]?.payload).toMatchObject({ status: "pending" });
        expect(
          (updates[0]?.payload as { customer_error?: unknown }).customer_error,
        ).toBeUndefined();
      },
    );

    it("5xx fra kilden gir pending med backoff og internal_error, ikke customer_error", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse({ status: 503 }));
      const { admin, updates } = buildAdmin();

      const result = await processListingImageJob(job({ attempts: 1 }), {
        supabaseAdmin: admin as never,
        transformer: fakeTransformer(),
        fetchImpl,
      });

      expect(result.outcome).toBe("retry_pending");
      const update = updates.find((u) => u.table === "listing_image_jobs");
      expect(update?.payload).toMatchObject({ status: "pending" });
      expect((update?.payload as { customer_error?: unknown }).customer_error).toBeUndefined();
      expect((update?.payload as { internal_error?: string }).internal_error).toMatch(/503/);
    });

    it("manglende Cloudflare Images-binding gir pending, ikke feil for kunden", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse());
      const transformer: ImageTransformer = {
        transform: vi.fn().mockRejectedValue(new ImagesUnavailableError()),
      };

      const result = await processListingImageJob(job({ attempts: 1 }), {
        supabaseAdmin: buildAdmin().admin as never,
        transformer,
        fetchImpl,
      });

      expect(result.outcome).toBe("retry_pending");
    });

    it("øker backoff-intervallet med antall forsøk (1, 5, 15, 60 min)", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse({ status: 503 }));
      const now = new Date("2026-01-01T00:00:00Z");

      for (const [attempts, expectedMinutes] of [
        [1, 1],
        [2, 5],
        [3, 15],
        [4, 60],
        [10, 60],
      ] as const) {
        const { admin, updates } = buildAdmin();
        await processListingImageJob(job({ attempts, created_at: now.toISOString() }), {
          supabaseAdmin: admin as never,
          transformer: fakeTransformer(),
          fetchImpl,
          now: () => now,
        });
        const update = updates.find((u) => u.table === "listing_image_jobs");
        const nextAttemptAt = new Date(
          (update?.payload as { next_attempt_at: string }).next_attempt_at,
        );
        expect((nextAttemptAt.getTime() - now.getTime()) / 60_000).toBe(expectedMinutes);
      }
    });

    it("gir opp etter 24 timer: status failed med ufarlig kundetekst, internal_error beholdt", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse({ status: 503 }));
      const createdAt = new Date("2026-01-01T00:00:00Z");
      const now = new Date(createdAt.getTime() + 25 * 60 * 60 * 1000);
      const { admin, updates } = buildAdmin();

      const result = await processListingImageJob(
        job({ created_at: createdAt.toISOString(), attempts: 20 }),
        {
          supabaseAdmin: admin as never,
          transformer: fakeTransformer(),
          fetchImpl,
          now: () => now,
        },
      );

      expect(result).toMatchObject({
        outcome: "internal_failed",
        message: "Bildet kunne ikke hentes fra adressen etter gjentatte forsøk.",
      });
      const update = updates.find((u) => u.table === "listing_image_jobs");
      expect(update?.payload).toMatchObject({
        status: "failed",
        customer_error: "Bildet kunne ikke hentes fra adressen etter gjentatte forsøk.",
      });
      expect((update?.payload as { internal_error?: string }).internal_error).toBeTruthy();
    });

    it("etter 24 timer med annen intern feil (ikke kildehenting) brukes Kaupet-driftsteksten", async () => {
      const fetchImpl = vi.fn().mockResolvedValue(jpegResponse());
      const transformer: ImageTransformer = {
        transform: vi.fn().mockRejectedValue(new Error("R2 nede")),
      };
      const createdAt = new Date("2026-01-01T00:00:00Z");
      const now = new Date(createdAt.getTime() + 25 * 60 * 60 * 1000);
      const { admin, updates } = buildAdmin();

      const result = await processListingImageJob(
        job({ created_at: createdAt.toISOString(), attempts: 20 }),
        { supabaseAdmin: admin as never, transformer, fetchImpl, now: () => now },
      );

      expect(result).toMatchObject({
        outcome: "internal_failed",
        message: "Bildet kunne ikke behandles på grunn av en feil hos Kaupet. Vi følger opp.",
      });
      const update = updates.find((u) => u.table === "listing_image_jobs");
      expect(update?.payload).toMatchObject({
        customer_error:
          "Bildet kunne ikke behandles på grunn av en feil hos Kaupet. Vi følger opp.",
      });
    });
  });

  it("CustomerImageError kan konstrueres direkte (brukt av klassifiseringstester over)", () => {
    expect(new CustomerImageError("x").message).toBe("x");
  });
});
