import { createFileRoute } from "@tanstack/react-router";
import { timingSafeEqual } from "node:crypto";

import { deletePrefix, type R2BucketName } from "@/lib/r2.server";

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

export const Route = createFileRoute("/api/public/r2/cleanup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!isAuthorized(request)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("r2_delete_queue")
          .select("id, bucket, prefix, attempts")
          .order("requested_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (error) return new Response("Kunne ikke lese slettekøen", { status: 500 });

        let deletedObjects = 0;
        let failed = 0;

        for (const row of rows ?? []) {
          try {
            deletedObjects += await deletePrefix(row.bucket as R2BucketName, row.prefix);
            await supabaseAdmin.from("r2_delete_queue").delete().eq("id", row.id);
          } catch (cause) {
            // Raden blir stående og forsøkes på nytt ved neste kjøring — et
            // objekt som ikke blir slettet er et personvernavvik, ikke noe
            // vi kan svelge.
            failed += 1;
            // Kun cron-jobben skriver her, én kjøring om gangen, så
            // attempts+1 trenger ingen atomisk inkrementering.
            await supabaseAdmin
              .from("r2_delete_queue")
              .update({
                attempts: row.attempts + 1,
                last_error: cause instanceof Error ? cause.message : String(cause),
              })
              .eq("id", row.id);
          }
        }

        return Response.json({ prefixes: rows?.length ?? 0, deletedObjects, failed });
      },
    },
  },
});
