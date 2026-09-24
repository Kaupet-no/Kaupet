import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Prosesserer ventende `listing_image_jobs` (se
// supabase/migrations/20260924130000_listing_image_jobs.sql). Kalles av en
// pg_cron-jobb hvert minutt via pg_net, med samme delte hemmelighet-mønster
// som /api/public/push/dispatch og /api/public/r2/cleanup.
function isAuthorized(request: Request): boolean {
  const expected = process.env.IMAGE_JOBS_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-image-jobs-secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// Ett kjør (hvert minutt) tar en liten bit av køen — nok til å holde tritt
// med normal synk-takt uten å holde en enkelt request-kjøring for lenge
// (hver jobb gjør et eksternt nettverkskall + en Cloudflare Images-
// transformasjon + R2-opplasting, sekvensielt).
const CLAIM_LIMIT = 5;

export const Route = createFileRoute("/api/public/images/process")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Dynamisk import: en statisk import av en .server-modul i
        // src/routes drar den inn i klientgrafen (se
        // scripts/check-server-boundary.mjs).
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { processListingImageJob } = await import("@/lib/listing-image-jobs.server");
        const { CloudflareImagesTransformer } = await import("@/lib/image-compression.server");

        const { data: jobs, error } = await supabaseAdmin.rpc("claim_listing_image_jobs", {
          _limit: CLAIM_LIMIT,
        });
        if (error) return new Response("Kunne ikke hente bildejobber", { status: 500 });

        const transformer = new CloudflareImagesTransformer();
        const summary = {
          claimed: jobs?.length ?? 0,
          done: 0,
          customerFailed: 0,
          retryPending: 0,
          internalFailed: 0,
        };

        // Sekvensielt, ikke parallelt: hver jobb gjør et eksternt
        // nettverkskall + Cloudflare Images-transformasjon, og batchen er
        // uansett liten (CLAIM_LIMIT). Parallellisering ville også gjort det
        // vanskeligere å holde seg innenfor Workers sitt subrequest-tak.
        for (const job of jobs ?? []) {
          const result = await processListingImageJob(job, { supabaseAdmin, transformer });
          switch (result.outcome) {
            case "done":
              summary.done += 1;
              break;
            case "customer_failed":
              summary.customerFailed += 1;
              break;
            case "retry_pending":
              summary.retryPending += 1;
              break;
            case "internal_failed":
              summary.internalFailed += 1;
              break;
          }
        }

        return Response.json(summary);
      },
    },
  },
});
