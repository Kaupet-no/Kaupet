import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

// Tømmer r2_delete_queue (se 20260918230000_r2_delete_queue.sql). Kalles av
// en pg_cron-jobb via pg_net, med samme delte hemmelighet-mønster som
// /api/public/push/dispatch. Endepunktet tar ingen input: hva som skal
// slettes leses utelukkende fra køen, så en forfalsket forespørsel kan på
// det verste utløse en opprydning som uansett skulle skjedd.
function isAuthorized(request: Request): boolean {
  const expected = process.env.R2_CLEANUP_SECRET;
  if (!expected) return false;
  const provided = request.headers.get("x-r2-cleanup-secret") ?? "";
  const expectedBuf = Buffer.from(expected);
  const providedBuf = Buffer.from(provided);
  if (expectedBuf.length !== providedBuf.length) return false;
  return timingSafeEqual(expectedBuf, providedBuf);
}

// Ett kjør per time tar denne biten av køen. Resten står til neste kjøring —
// det holder rikelig mot normal slettetakt, og begrenser hvor lenge én
// forespørsel kan holde på.
const BATCH_SIZE = 100;

// En rad som feiler permanent (f.eks. ugyldig prefiks) skal ikke få stå
// først i køen for alltid — den utestenger friske rader fra hver batch og
// forsøkes på nytt hver time uten grunn til å tro utfallet endrer seg.
// Terskelen er duplisert i dispatch_r2_cleanup (supabase/migrations/
// 20260918230000_r2_delete_queue.sql) sitt varsel for oppbrukte rader —
// oppdater begge steder samtidig.
const MAX_ATTEMPTS = 10;

// Exact uploads use up to 100 DELETEs first. Legacy prefixes then share a
// 500-object budget; listObjectKeys sends max-keys and leaves partial queue
// rows for the next run. Even with 100 prefix listings, this stays below 700
// R2 subrequests per Worker request.
const MAX_OBJECTS_PER_RUN = 500;

// Fem feil på rad er nesten aldri N enkeltrader med ugyldig prefiks — det er
// et kjøringsnivå-problem (R2 nede, subrequest-taket nådd, manglende
// credentials), og da skal vi ikke straffe resten av batchen med
// attempts+1. Nullstilles ved hver vellykkede sletting.
const MAX_CONSECUTIVE_FAILURES = 5;

export const Route = createFileRoute("/api/public/r2/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        // Dynamisk import av samme grunn som supabaseAdmin under: en statisk
        // import av en .server-modul i src/routes drar den inn i
        // klientgrafen (se scripts/check-server-boundary.mjs).
        const { deleteObject, deletePrefix, PrefixDeleteError } = await import("@/lib/r2.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("r2_delete_queue")
          .select("id, bucket, prefix, attempts")
          .lt("attempts", MAX_ATTEMPTS)
          .order("requested_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (error) return new Response("Kunne ikke lese slettekøen", { status: 500 });

        let deletedObjects = 0;
        let objectOperations = 0;
        let failed = 0;
        let consecutiveFailures = 0;
        let stopped: "budget" | "failures" | null = null;

        // Claim exact standard-upload keys first so a busy legacy prefix
        // queue cannot starve them. The SQL claim locks and checks references.
        const { data: tracked, error: claimError } = await supabaseAdmin.rpc(
          "claim_orphan_standard_uploads",
          { _limit: BATCH_SIZE },
        );
        if (claimError)
          return new Response("Kunne ikke hente foreldreløse opplastinger", { status: 500 });
        for (const row of tracked ?? []) {
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            stopped = "failures";
            break;
          }
          objectOperations += 1;
          try {
            await deleteObject(row.bucket as "BILDER" | "VEDLEGG", row.object_key);
            deletedObjects += 1;
            const { error } = await supabaseAdmin.rpc("finish_orphan_standard_upload", {
              _id: row.id,
              _deleted: true,
            });
            if (error) throw error;
            consecutiveFailures = 0;
          } catch (cause) {
            failed += 1;
            consecutiveFailures += 1;
            await supabaseAdmin.rpc("finish_orphan_standard_upload", {
              _id: row.id,
              _deleted: false,
              _error: cause instanceof Error ? cause.message : String(cause),
            });
          }
        }

        for (const row of rows ?? []) {
          if (objectOperations >= MAX_OBJECTS_PER_RUN) {
            stopped = "budget";
            break;
          }
          if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
            stopped = "failures";
            break;
          }

          try {
            const budget = MAX_OBJECTS_PER_RUN - objectOperations;
            const deleted = await deletePrefix(
              row.bucket as Parameters<typeof deletePrefix>[0],
              row.prefix,
              budget,
            );
            objectOperations += deleted;
            deletedObjects += deleted;
            consecutiveFailures = 0;
            if (deleted === budget) {
              stopped = "budget";
              break;
            }
            await supabaseAdmin.from("r2_delete_queue").delete().eq("id", row.id);
          } catch (cause) {
            if (cause instanceof PrefixDeleteError) {
              objectOperations += cause.attemptedObjects;
              deletedObjects += cause.deletedObjects;
            }
            failed += 1;
            consecutiveFailures += 1;
            await supabaseAdmin
              .from("r2_delete_queue")
              .update({
                attempts: row.attempts + 1,
                last_error: cause instanceof Error ? cause.message : String(cause),
              })
              .eq("id", row.id);
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              stopped = "failures";
              break;
            }
          }
        }

        return Response.json({
          prefixes: (rows?.length ?? 0) + (tracked?.length ?? 0),
          deletedObjects,
          failed,
          stopped,
        });
      },
    },
  },
});
