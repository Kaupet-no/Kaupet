import { beforeEach, describe, expect, it, vi } from "vitest";

const claimJobs = vi.fn();
const processListingImageJob = vi.fn();

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: (...args: unknown[]) => claimJobs(...args) },
}));

vi.mock("@/lib/listing-image-jobs.server", () => ({
  processListingImageJob: (...args: unknown[]) => processListingImageJob(...args),
}));

vi.mock("@/lib/image-compression.server", () => ({
  CloudflareImagesTransformer: class {},
}));

async function post() {
  const { Route } = await import("./process");
  const request = new Request("http://localhost/api/public/images/process", {
    method: "POST",
    headers: { "x-image-jobs-secret": "test-secret" },
  });
  // @ts-expect-error server handlers er tilgjengelig i praksis
  return Route.options.server.handlers.POST({ request });
}

function job(id: string) {
  return { id, listing_id: "listing-1", source_url: `https://example.com/${id}.jpg` };
}

beforeEach(() => {
  vi.resetModules();
  claimJobs.mockReset();
  processListingImageJob.mockReset();
  process.env.IMAGE_JOBS_SECRET = "test-secret";
});

describe("images process endpoint", () => {
  it("avviser forespørsler uten riktig hemmelighet", async () => {
    const { Route } = await import("./process");
    const request = new Request("http://localhost/api/public/images/process", { method: "POST" });
    // @ts-expect-error server handlers er tilgjengelig i praksis
    const res = await Route.options.server.handlers.POST({ request });
    expect(res.status).toBe(401);
  });

  it("prosesserer sekvensielt og oppsummerer utfall per type", async () => {
    claimJobs.mockResolvedValue({ data: [job("a"), job("b"), job("c"), job("d")], error: null });
    processListingImageJob
      .mockResolvedValueOnce({ outcome: "done", jobId: "a", storagePath: "x" })
      .mockResolvedValueOnce({ outcome: "customer_failed", jobId: "b", message: "m" })
      .mockResolvedValueOnce({ outcome: "retry_pending", jobId: "c", nextAttemptAt: "later" })
      .mockResolvedValueOnce({ outcome: "internal_failed", jobId: "d", message: "m" });

    const res = await post();
    const body = await res.json();

    expect(body).toEqual({
      claimed: 4,
      done: 1,
      customerFailed: 1,
      retryPending: 1,
      internalFailed: 1,
    });
    expect(processListingImageJob).toHaveBeenCalledTimes(4);
  });

  it("svarer med tom oppsummering når det ikke finnes ventende jobber", async () => {
    claimJobs.mockResolvedValue({ data: [], error: null });

    const res = await post();
    const body = await res.json();

    expect(body).toEqual({
      claimed: 0,
      done: 0,
      customerFailed: 0,
      retryPending: 0,
      internalFailed: 0,
    });
    expect(processListingImageJob).not.toHaveBeenCalled();
  });

  it("gir 500 hvis claim_listing_image_jobs feiler", async () => {
    claimJobs.mockResolvedValue({ data: null, error: { message: "db feil" } });

    const res = await post();
    expect(res.status).toBe(500);
    expect(processListingImageJob).not.toHaveBeenCalled();
  });
});
