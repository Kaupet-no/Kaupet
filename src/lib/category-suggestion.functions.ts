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
  .validator((input: unknown) =>
    z.object({ title: z.string().trim().min(3).max(120) }).parse(input),
  )
  .handler(async ({ data }) => {
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("suggest-category-for-title", 40, 300);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows, error } = await supabaseAdmin.rpc("suggest_category_for_title", {
      _title: data.title,
    });
    if (error) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", error);
    }

    const top = rows?.[0];
    const totalVotes = (rows ?? []).reduce(
      (sum: number, r: { votes: number }) => sum + Number(r.votes),
      0,
    );
    const share = top && totalVotes > 0 ? Number(top.votes) / totalVotes : 0;
    const hasConfidentVote =
      !!top && totalVotes >= MIN_TOTAL_VOTES && Number.isFinite(share) && share >= MIN_SHARE;
    const voteSuggestion = hasConfidentVote
      ? {
          category_id: top.category_id as string,
          slug: top.slug as string,
          name_nb: top.name_nb as string,
          parent_id: top.parent_id as string | null,
          parent_name_nb: top.parent_name_nb as string | null,
          confidence: share,
        }
      : null;

    return { suggestions: voteSuggestion ? [voteSuggestion] : [] };
  });

/** Explicit title-assistance action. Unlike the internal vote lookup above,
 * this boundary requires a fresh Turnstile token and is the only path that
 * may contact Mistral for title-based suggestions. */
export const suggestCategoryForTitleWithAi = createServerFn({ method: "POST" })
  .validator((input: unknown) =>
    z
      .object({
        title: z.string().trim().min(3).max(120),
        turnstileToken: z.string().min(1),
      })
      .strict()
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("suggest-category-for-title-ai", 20, 600);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("site_settings")
      .select("category_suggestion_ai_enabled")
      .single();
    if (settings?.category_suggestion_ai_enabled === false) return { suggestions: [] };
    try {
      const { suggestCategoryForTitleAi } = await import("@/lib/category-suggestion-ai.server");
      return { suggestions: (await suggestCategoryForTitleAi({ title: data.title })) ?? [] };
    } catch {
      return { suggestions: [] };
    }
  });

const photoSuggestionInputSchema = z
  .object({
    operation: z.enum(["identify", "attributes"]),
    title: z.string().trim().max(120).optional(),
    categorySlug: z.string().trim().max(100).optional(),
    turnstileToken: z.string().min(1),
    images: z
      .array(
        z.object({
          mime: z.enum(["image/jpeg", "image/png", "image/webp"]),
          dataUrl: z.string().max(220_000),
        }),
      )
      .min(1)
      .max(3),
  })
  .strict();

/** Mirrors suggestListingFromPhotosAi's shape so callers never have to branch
 * on which layer refused the request. */
const PHOTO_UNAVAILABLE = {
  status: "unavailable" as const,
  source: "photo-ai" as const,
  categories: [],
  attributes: [],
};

/** Explicit photo-assistance boundary. Token validation intentionally happens
 * before rate limiting and provider work; the client must call this again
 * with a fresh token for every request. */
export const suggestListingFromPhotos = createServerFn({ method: "POST" })
  .validator((input: unknown) => photoSuggestionInputSchema.parse(input))
  .handler(async ({ data }) => {
    const { verifyTurnstileToken } = await import("@/lib/turnstile.server");
    await verifyTurnstileToken(data.turnstileToken);
    const { assertNotRateLimited } = await import("@/lib/rate-limit.server");
    await assertNotRateLimited("suggest-listing-from-photos", 10, 600);
    if (process.env.MISTRAL_PHOTO_SUGGESTIONS_ENABLED !== "true") return PHOTO_UNAVAILABLE;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("site_settings")
      .select("category_suggestion_ai_enabled")
      .single();
    if (settings?.category_suggestion_ai_enabled === false) return PHOTO_UNAVAILABLE;
    const { suggestListingFromPhotosAi } = await import("@/lib/category-suggestion-ai.server");
    return suggestListingFromPhotosAi({
      operation: data.operation,
      title: data.title,
      categorySlug: data.categorySlug,
      images: data.images,
    });
  });

/** In-memory cache of in-flight/settled internal category requests, keyed by
 * trimmed title. */
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
