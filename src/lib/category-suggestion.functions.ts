import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const MIN_TOTAL_VOTES = 8;
const MIN_SHARE = 0.55;

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

    if (!top || totalVotes < MIN_TOTAL_VOTES || share < MIN_SHARE) {
      const { suggestCategoryForTitleAi } = await import("@/lib/category-suggestion-ai.server");
      const aiSuggestions = await suggestCategoryForTitleAi({ title: data.title }).catch(
        () => null,
      );
      return { suggestions: aiSuggestions ?? [] };
    }

    return {
      suggestions: [
        {
          category_id: top.category_id as string,
          slug: top.slug as string,
          name_nb: top.name_nb as string,
          parent_id: top.parent_id as string | null,
          parent_name_nb: top.parent_name_nb as string | null,
          confidence: share,
        },
      ],
    };
  });

/** In-memory cache of in-flight/settled suggestion requests, keyed by trimmed
 * title. Lets `intent-title-landing.tsx` kick off the (cold-start-prone, up
 * to ~20s) AI category call the moment the user submits a title, while
 * `use-listing-title-hints.ts` reuses that same promise once the wizard
 * mounts instead of starting a fresh request — turning the image step's
 * duration into free warm-up time. Survives client-side route navigation
 * since it's a module-level singleton, not per-component state. */
const suggestionCache = new Map<string, ReturnType<typeof suggestCategoryForTitle>>();

const RETRY_ATTEMPTS = 3;
const RETRY_DELAY_MS = 3000;

/** The AI call is cold-start-prone (up to ~20s), so a request fired early
 * (e.g. from the landing screen) can fail before the endpoint has warmed
 * up. Retries a few times rather than caching a permanently-rejected
 * promise, since callers only re-invoke prefetch when the title changes. */
async function suggestWithRetry(title: string) {
  for (let attempt = 1; attempt <= RETRY_ATTEMPTS; attempt++) {
    try {
      return await suggestCategoryForTitle({ data: { title } });
    } catch {
      if (attempt === RETRY_ATTEMPTS) return { suggestions: [] };
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  return { suggestions: [] };
}

export function prefetchCategorySuggestion(title: string) {
  const key = title.trim();
  if (!suggestionCache.has(key)) {
    suggestionCache.set(key, suggestWithRetry(key));
  }
  return suggestionCache.get(key)!;
}
