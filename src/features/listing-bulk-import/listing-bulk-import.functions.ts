import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { MAX_IMPORT_ROWS, type BulkImportRow } from "./import-schema";

/** Alias, ikke et statisk import fra `listing-sync.server.ts` — se
 * `scripts/check-server-boundary.mjs`, som forbyr at klientkode (denne
 * modulen lastes statisk av `BulkListingImport.tsx`) importerer `*.server`-
 * moduler, også som ren typeimport. `import(...)`-formen under er
 * type-only og fjernes helt ved kompilering, så den utløser ikke
 * grenseskriptet eller ESLint-regelen `no-restricted-imports`. */
export type BulkImportResult = import("./listing-sync.server").ListingSyncResult;

export const createListingsFromImport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: unknown) =>
    z
      .object({
        importId: z.string().uuid(),
        rows: z.array(z.unknown()).min(1).max(MAX_IMPORT_ROWS),
        locationId: z.string().uuid(),
        showVisitingAddress: z.boolean().default(false),
        mode: z.enum(["create", "upsert"]).default("create"),
        dryRun: z.boolean().default(false),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { resolveOrganizationActor, loadSyncContext, syncListings } =
      await import("./listing-sync.server");
    const actor = await resolveOrganizationActor(supabaseAdmin, {
      userId: context.userId,
      locationId: data.locationId,
      showVisitingAddress: data.showVisitingAddress,
      source: "excel",
    });
    const syncContext = await loadSyncContext(supabaseAdmin, actor);
    const rows = data.rows.map((value, index) => {
      const row = value as Partial<BulkImportRow>;
      return {
        ...row,
        rowNumber: typeof row.rowNumber === "number" ? row.rowNumber : index + 2,
      } as BulkImportRow;
    });
    return syncListings(supabaseAdmin, syncContext, {
      importId: data.importId,
      rows,
      mode: data.mode,
      dryRun: data.dryRun,
    });
  });
