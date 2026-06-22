import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MIN_TOTAL_VOTES = 8;
const MIN_SHARE = 0.55;

export const suggestCategoryForTitle = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ title: z.string().min(3).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("suggest_category_for_title", {
      _title: data.title,
    });
    if (error) throw error;
    if (!rows || rows.length === 0) return { suggestion: null };

    const top = rows[0];
    const totalVotes = rows.reduce((sum: number, r: { votes: number }) => sum + Number(r.votes), 0);
    const share = Number(top.votes) / totalVotes;

    if (totalVotes < MIN_TOTAL_VOTES || share < MIN_SHARE) {
      return { suggestion: null };
    }

    return {
      suggestion: {
        category_id: top.category_id as string,
        slug: top.slug as string,
        name_nb: top.name_nb as string,
        parent_id: top.parent_id as string | null,
        parent_name_nb: top.parent_name_nb as string | null,
        confidence: share,
      },
    };
  });
