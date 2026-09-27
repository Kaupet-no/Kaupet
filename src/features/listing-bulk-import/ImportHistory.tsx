import { useQuery } from "@tanstack/react-query";
import { AlertCircle, Clock, History } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";

/** Rå kolonner vi trenger fra `organization_listing_imports`. Ikke hele
 * radtypen (`Database["public"]["Tables"]["organization_listing_imports"]["Row"]`)
 * — vi grupperer selv og trenger ikke resten av kolonnene. */
type ImportHistoryRow = {
  import_id: string;
  source: string;
  status: string;
  created_at: string;
  listing_id: string | null;
};

type ImportRunCounts = {
  created: number;
  updated: number;
  unchanged: number;
  renewed: number;
  failed: number;
};

type ImportRun = {
  importId: string;
  source: string;
  createdAt: string;
  counts: ImportRunCounts;
  listingIds: string[];
};

/** Bildestatus for en importkjøring (steg 4: bilder serverside). Kun
 * kundevendte tall og tekster — `internal_error` er verken hentet (RLS-
 * kolonnegrant hindrer det uansett) eller vist noe sted. */
type ImportRunImageStatus = {
  /** `pending`/`processing` — jobben venter eller behandles, kan ende i
   * begge de andre gruppene. Vises som "Behandles" siden en intern feil
   * (vi eier) ALDRI skal vises som noe kunden må reagere på. */
  processing: number;
  /** `failed` MED `customer_error` — en feil kunden selv kan rette. */
  failed: number;
  /** De faktiske, norske `customer_error`-tekstene for feilede bilder i
   * denne kjøringen (deduplisert), til bruk i en kort forklaring. */
  failedMessages: string[];
};

const SOURCE_LABELS_NB: Record<string, string> = {
  excel: "Excel",
  api: "API",
  mcp: "MCP",
};

const STATUS_LABELS_NB: Record<keyof ImportRunCounts, string> = {
  created: "Opprettet",
  updated: "Oppdatert",
  unchanged: "Uendret",
  renewed: "Fornyet",
  failed: "Feilet",
};

const STATUS_ORDER = Object.keys(STATUS_LABELS_NB) as (keyof ImportRunCounts)[];

/** Antall siste kjøringer (distinkte `import_id`-er) å vise. */
export const IMPORT_HISTORY_RUN_LIMIT = 20;

/** Antall rader hentet fra tabellen for å utlede kjøringene over. En kjøring
 * kan ha inntil `INTEGRATION_LIMITS.maxBatchRows` (500) rader, så vinduet
 * dekker komfortabelt godt over 20 kjøringer for vanlige, mindre opplastinger
 * og minst ti kjøringer selv ved maks radantall på alle. Bevisst valg:
 * grupperingen («de N siste distinkte `import_id`-verdiene») kan ikke
 * uttrykkes i én PostgREST-spørring, og medlemmer har allerede SELECT via
 * RLS (se `organization_listing_imports_member_select`), så et avgrenset
 * klientoppslag er enklere enn en egen serverfunksjon og treffer riktig i
 * praksis. En kjøring som strekker seg utenfor vinduet vil vise et ufullstendig
 * (men ikke feilaktig — kun mangelfullt) antall for de eldste radene sine. */
const HISTORY_ROW_WINDOW = 5000;

function emptyCounts(): ImportRunCounts {
  return { created: 0, updated: 0, unchanged: 0, renewed: 0, failed: 0 };
}

function groupIntoRuns(rows: ImportHistoryRow[]): ImportRun[] {
  const byImportId = new Map<string, ImportRun>();
  for (const row of rows) {
    let run = byImportId.get(row.import_id);
    if (!run) {
      if (byImportId.size >= IMPORT_HISTORY_RUN_LIMIT) continue;
      // Rader kommer sortert etter created_at synkende, så den første raden
      // vi ser for en import_id er også kjøringens seneste tidspunkt.
      run = {
        importId: row.import_id,
        source: row.source,
        createdAt: row.created_at,
        counts: emptyCounts(),
        listingIds: [],
      };
      byImportId.set(row.import_id, run);
    }
    if ((run.counts as Record<string, number>)[row.status] !== undefined) {
      (run.counts as Record<string, number>)[row.status] += 1;
    }
    if (row.listing_id) run.listingIds.push(row.listing_id);
  }
  return [...byImportId.values()];
}

// Chunkstørrelse for `.in("listing_id", …)`-oppslaget under, av samme grunn
// som REF_LOOKUP_CHUNK_SIZE i listing-sync.server.ts (kort URL).
const LISTING_IDS_CHUNK_SIZE = 100;

/** Henter bildestatus (steg 4) for et sett med annonse-id-er, gruppert per
 * annonse. Egen spørring mot `listing_image_jobs` — RLS begrenser den til
 * organisasjonens egne rader, og kolonne-grant-en (se migrasjonen) skjuler
 * `internal_error` for klienten, akkurat som ønsket her. */
async function fetchImageStatusByListingId(
  listingIds: string[],
): Promise<Map<string, { processing: number; failed: number; failedMessages: string[] }>> {
  const result = new Map<
    string,
    { processing: number; failed: number; failedMessages: string[] }
  >();
  for (let offset = 0; offset < listingIds.length; offset += LISTING_IDS_CHUNK_SIZE) {
    const chunk = listingIds.slice(offset, offset + LISTING_IDS_CHUNK_SIZE);
    const { data, error } = await supabase
      .from("listing_image_jobs")
      .select("listing_id, status, customer_error")
      .in("listing_id", chunk);
    if (error) throw error;
    for (const job of data ?? []) {
      const entry = result.get(job.listing_id) ?? { processing: 0, failed: 0, failedMessages: [] };
      if (job.status === "pending" || job.status === "processing") {
        entry.processing += 1;
      } else if (job.status === "failed" && job.customer_error) {
        entry.failed += 1;
        if (!entry.failedMessages.includes(job.customer_error)) {
          entry.failedMessages.push(job.customer_error);
        }
      }
      result.set(job.listing_id, entry);
    }
  }
  return result;
}

async function fetchImportHistory(
  organizationId: string,
): Promise<(ImportRun & { imageStatus: ImportRunImageStatus })[]> {
  const { data, error } = await supabase
    .from("organization_listing_imports")
    .select("import_id, source, status, created_at, listing_id")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROW_WINDOW);
  if (error) throw error;
  const runs = groupIntoRuns((data ?? []) as ImportHistoryRow[]);

  const allListingIds = Array.from(new Set(runs.flatMap((run) => run.listingIds)));
  const imageStatusByListingId =
    allListingIds.length > 0 ? await fetchImageStatusByListingId(allListingIds) : new Map();

  return runs.map((run) => {
    const imageStatus: ImportRunImageStatus = { processing: 0, failed: 0, failedMessages: [] };
    for (const listingId of run.listingIds) {
      const entry = imageStatusByListingId.get(listingId);
      if (!entry) continue;
      imageStatus.processing += entry.processing;
      imageStatus.failed += entry.failed;
      for (const message of entry.failedMessages) {
        if (!imageStatus.failedMessages.includes(message)) imageStatus.failedMessages.push(message);
      }
    }
    return { ...run, imageStatus };
  });
}

/**
 * Viser organisasjonens siste importkjøringer, gruppert per `import_id`, med
 * tidspunkt, kilde (Excel/API/MCP) og antall rader per utfall. Gjenbrukbar:
 * tar kun `organizationId` og henter selv, slik at den både kan vises i
 * importdialogens startvisning og senere i «Integrasjoner»-seksjonen (steg 5).
 */
export function ImportHistory({ organizationId }: { organizationId: string }) {
  const {
    data: runs,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["listing-import-history", organizationId],
    queryFn: () => fetchImportHistory(organizationId),
    staleTime: 30_000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2" aria-label="Laster importhistorikk">
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
      </div>
    );
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="size-4" />
        <AlertDescription>Importhistorikken kunne ikke lastes. Prøv igjen senere.</AlertDescription>
      </Alert>
    );
  }

  if (!runs || runs.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="Ingen importer ennå"
        description="Når dere laster opp en fil eller synker via API/MCP, vises tidspunkt, kilde og antall opprettede, oppdaterte og fornyede annonser her."
      />
    );
  }

  return (
    <ul className="space-y-2">
      {runs.map((run) => (
        <li key={run.importId} className="rounded-md border p-3 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-medium">
              <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
              {new Date(run.createdAt).toLocaleString("nb-NO")}
            </span>
            <Badge variant="outline">{SOURCE_LABELS_NB[run.source] ?? run.source}</Badge>
          </div>
          <p className="mt-1 text-muted-foreground">
            {STATUS_ORDER.filter((key) => run.counts[key] > 0)
              .map((key) => `${STATUS_LABELS_NB[key]}: ${run.counts[key]}`)
              .join(" · ") || "Ingen endringer"}
          </p>
          {(run.imageStatus.processing > 0 || run.imageStatus.failed > 0) && (
            <p className="mt-1 text-muted-foreground">
              {[
                run.imageStatus.processing > 0
                  ? `Bilder behandles: ${run.imageStatus.processing}`
                  : null,
                run.imageStatus.failed > 0 ? `Bilder feilet: ${run.imageStatus.failed}` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
              {run.imageStatus.failedMessages.length > 0 && (
                <span className="block text-xs">{run.imageStatus.failedMessages.join(" ")}</span>
              )}
            </p>
          )}
        </li>
      ))}
    </ul>
  );
}
