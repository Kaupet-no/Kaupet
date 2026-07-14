import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const suggestKeywordsForListing = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) =>
    z.object({ title: z.string().max(200), category_id: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("suggest_keywords_for_listing", {
      _title: data.title,
      _category_id: data.category_id,
    });
    if (error) throw error;

    return (rows ?? []) as { word: string; listing_count: number }[];
  });
