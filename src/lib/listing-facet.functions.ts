import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import type { Json } from "@/integrations/supabase/types";

const facetInputSchema = z.object({
  categoryIds: z.array(z.string().uuid()).max(20).nullable().optional(),
  conditions: z.array(z.string().max(32)).max(10).nullable().optional(),
  priceMin: z.number().finite().nullable().optional(),
  priceMax: z.number().finite().nullable().optional(),
  includeFree: z.boolean().default(true),
  activeAttrs: z.record(z.string().max(80), z.unknown()).default({}),
  facetKeys: z.array(z.string().max(80)).max(50),
});

export const getListingFacetCounts = createServerFn({ method: "POST" })
  .validator((input: unknown) => facetInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("listing-filter-facet-counts", 60, 60);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("listing_filter_facet_counts", {
      p_category_ids: data.categoryIds ?? undefined,
      p_conditions: data.conditions ?? undefined,
      p_price_min: data.priceMin ?? undefined,
      p_price_max: data.priceMax ?? undefined,
      p_include_free: data.includeFree,
      p_listing_ids: undefined,
      p_active_attrs: data.activeAttrs as unknown as Json,
      p_facet_keys: data.facetKeys,
    });
    if (error) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", error);
    }
    return rows ?? [];
  });
