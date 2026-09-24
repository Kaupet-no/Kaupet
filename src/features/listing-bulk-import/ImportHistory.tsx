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
      };
      byImportId.set(row.import_id, run);
    }
    if ((run.counts as Record<string, number>)[row.status] !== undefined) {
      (run.counts as Record<string, number>)[row.status] += 1;
    }
  }
  return [...byImportId.values()];
}

async function fetchImportHistory(organizationId: string): Promise<ImportRun[]> {
  const { data, error } = await supabase
    .from("organization_listing_imports")
    .select("import_id, source, status, created_at")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(HISTORY_ROW_WINDOW);
  if (error) throw error;
  return groupIntoRuns((data ?? []) as ImportHistoryRow[]);
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
        </li>
      ))}
    </ul>
  );
}
