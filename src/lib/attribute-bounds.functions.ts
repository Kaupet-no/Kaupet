import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export type AttributeRangeBoundsMap = Record<string, { min: number; max: number }>;

/** Min/max per numeric attribute key across active listings in the category
 * subtree — the data behind the dynamic Ønskes kjøpt slider scales. */
export const getAttributeRangeBounds = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ categoryId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("attribute_range_bounds", {
      cat_id: data.categoryId,
    });
    if (error) throw error;
    const map: AttributeRangeBoundsMap = {};
    for (const row of rows ?? []) {
      map[row.key] = { min: Number(row.min_val), max: Number(row.max_val) };
    }
    return map;
  });
