import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MIN_TOTAL_VOTES = 8;
const MIN_SHARE = 0.55;

type CategorySuggestion = {
  category_id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  parent_name_nb: string | null;
  confidence: number;
};

type CategorySuggestionResult = { suggestions: CategorySuggestion[] };

export const suggestCategoryForTitle = createServerFn({ method: "GET" })
  .validator((input: unknown) => z.object({ title: z.string().min(3).max(200) }).parse(input))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("suggest_category_for_title", {
      _title: data.title,
    });
    if (error) throw error;

    const top = rows?.[0];
    const totalVotes = (rows ?? []).reduce(
      (sum: number, r: { votes: number }) => sum + Number(r.votes),
      0,
    );
    const share = top ? Number(top.votes) / totalVotes : 0;
    const voteSuggestion = top
      ? {
          category_id: top.category_id as string,
          slug: top.slug as string,
          name_nb: top.name_nb as string,
          parent_id: top.parent_id as string | null,
          parent_name_nb: top.parent_name_nb as string | null,
          confidence: share,
        }
      : null;

    if (!top || totalVotes < MIN_TOTAL_VOTES || share < MIN_SHARE) {
      // Keep this dynamic import at the server boundary: this module is also
      // imported by client components, while the AI provider must stay server-only.
      const { suggestCategoryForTitleAi } = await import("@/lib/category-suggestion-ai.server");
      const aiSuggestions = await suggestCategoryForTitleAi({ title: data.title });
      return { suggestions: aiSuggestions ?? (voteSuggestion ? [voteSuggestion] : []) };
    }

    return { suggestions: voteSuggestion ? [voteSuggestion] : [] };
  });

/** In-memory cache of in-flight/settled suggestion requests, keyed by trimmed
 * title. Lets `intent-title-landing.tsx` start the request before the wizard
 * mounts, while `use-listing-title-hints.ts` reuses that same promise. */
const suggestionCache = new Map<string, Promise<CategorySuggestionResult>>();

export function prefetchCategorySuggestion(title: string) {
  const key = title.trim();
  if (!suggestionCache.has(key)) {
    suggestionCache.set(
      key,
      suggestCategoryForTitle({ data: { title: key } }).catch(() => ({ suggestions: [] })),
    );
  }
  return suggestionCache.get(key)!;
}
