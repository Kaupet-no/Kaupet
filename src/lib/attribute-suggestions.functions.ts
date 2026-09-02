import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Autocomplete suggestions for a free-text attribute (e.g. boat Merke/
 * Modell): distinct values from active listings in the category subtree,
 * prefix-matched on what the user has typed so far. */
export const getAttributeValueSuggestions = createServerFn({ method: "GET" })
  .validator((input: unknown) =>
    z
      .object({
        categoryId: z.string().uuid(),
        key: z.string().min(1).max(64),
        q: z.string().max(120).optional().default(""),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("attribute-value-suggestions", 120, 300);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows, error } = await supabaseAdmin.rpc("attribute_value_suggestions", {
      cat_id: data.categoryId,
      attr_key: data.key,
      q: data.q,
    });
    if (error) throw error;
    return (rows ?? []).map((r) => r.value);
  });
