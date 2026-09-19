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

// deletePrefix gjør ett listObjectKeys-kall pluss ett deleteObject-kall per
// nøkkel. Et annonseprefiks kan romme ~76 objekter (20 bilder + thumbnails +
// 36 360-frames), så en full BATCH_SIZE-batch kan i verste fall koste
// tusenvis av fetch-kall i én request — Cloudflare Workers tillater maks
// 1000 subrequests per request, og kjøringen ryker når taket nås. Vi sjekker
// budsjettet FØR hvert prefiks, så det siste prefikset som får starte kan i
// verste fall dra budsjettet opp til ~500 + 76 ≈ 576 objekter/subrequests —
// fremdeles godt under taket.
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
        const { deletePrefix } = await import("@/lib/r2.server");
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: rows, error } = await supabaseAdmin
          .from("r2_delete_queue")
          .select("id, bucket, prefix, attempts")
          .lt("attempts", MAX_ATTEMPTS)
          .order("requested_at", { ascending: true })
          .limit(BATCH_SIZE);
        if (error) return new Response("Kunne ikke lese slettekøen", { status: 500 });

        let deletedObjects = 0;
        let failed = 0;
        let consecutiveFailures = 0;
        let stopped: "budget" | "failures" | null = null;

        for (const row of rows ?? []) {
          // Budsjettet er brukt opp — resten av batchen står urørt til neste
          // kjøring, med attempts uendret. De ble aldri forsøkt.
          if (deletedObjects >= MAX_OBJECTS_PER_RUN) {
            stopped = "budget";
            break;
          }

          try {
            deletedObjects += await deletePrefix(
              row.bucket as Parameters<typeof deletePrefix>[0],
              row.prefix,
            );
            await supabaseAdmin.from("r2_delete_queue").delete().eq("id", row.id);
            consecutiveFailures = 0;
          } catch (cause) {
            // Raden blir stående og forsøkes på nytt ved neste kjøring — et
            // objekt som ikke blir slettet er et personvernavvik, ikke noe
            // vi kan svelge. Når MAX_ATTEMPTS er nådd faller den ut av
            // spørringen over, men den slettes IKKE: den blir liggende med
            // last_error intakt som et synlig personvernavvik til manuell
            // oppfølging, siden køen er revisjonssporet for GDPR-dokumentasjonen.
            failed += 1;
            consecutiveFailures += 1;
            // Kun cron-jobben skriver her, én kjøring om gangen, så
            // attempts+1 trenger ingen atomisk inkrementering.
            await supabaseAdmin
              .from("r2_delete_queue")
              .update({
                attempts: row.attempts + 1,
                last_error: cause instanceof Error ? cause.message : String(cause),
              })
              .eq("id", row.id);

            // Kretsbryter: så mange feil på rad skyldes nesten sikkert
            // kjøringen selv, ikke radene. Stopp før vi brenner opp
            // attempts-budsjettet til resten av friske rader.
            if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
              stopped = "failures";
              break;
            }
          }
        }

        return Response.json({ prefixes: rows?.length ?? 0, deletedObjects, failed, stopped });
      },
    },
  },
});
