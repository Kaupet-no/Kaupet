import { z } from "zod";

const inputSchema = z.object({ title: z.string().min(3).max(200) });

type CategoryRow = { id: string; slug: string; name_nb: string; parent_id: string | null };

/**
 * AI fallback for `suggestCategoryForTitle` (category-suggestion.functions.ts),
 * used only when the vote-based RPC has no confident match — e.g. a title
 * with no prior listing history. Prompts the borealis-1b endpoint to pick one
 * or two category names from the full list, then validates the answer(s)
 * against real categories before returning them (never trust model output
 * directly). Returns null if nothing validated, otherwise 1-2 candidates.
 */
export async function suggestCategoryForTitleAi(input: unknown) {
  const { title } = inputSchema.parse(input);

  const endpointUrl = process.env.HF_BOREALIS_ENDPOINT_URL;
  const token = process.env.HF_TOKEN;
  if (!endpointUrl || !token) return null;

  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: categories, error } = await supabaseAdmin
    .from("categories")
    .select("id, slug, name_nb, parent_id")
    .eq("is_hidden", false);
  if (error || !categories || categories.length === 0) return null;

  // Only leaf categories (no children) are ever a valid category_id target —
  // CategoryPicker itself only lets a user select one with no children (see
  // category-picker.tsx's hasChildren check), so a parent/mid-level "container"
  // category (e.g. "Sittemøbler") was never a real answer to begin with.
  // This also keeps the prompt within the model's context window: sending the
  // full category tree (incl. non-leaf nodes) overflows borealis-1b's
  // 1024-token context as the tree grows; leaf-only fits with headroom today.
  const parentIds = new Set(
    (categories as CategoryRow[]).map((c) => c.parent_id).filter((id): id is string => !!id),
  );
  // "Motorsport" (tidl. "Bilsport") holdes utenfor modellens valgmuligheter —
  // den er ofte "riktig" for en rask bil/MC, men brukeren mener som regel
  // "Bil"/"MC". category-confirm tilbyr i stedet en egen
  // "Benytt kategori Motorsport"-knapp når modellen foreslår en av de
  // vertikalene den lett forveksles med.
  const leafCategories = (categories as CategoryRow[]).filter(
    (c) => !parentIds.has(c.id) && c.name_nb !== "Motorsport",
  );
  if (leafCategories.length === 0) return null;

  const byName = new Map(leafCategories.map((c) => [c.name_nb, c]));
  // Truncated defensively — the model only needs enough of the title to
  // classify it, and this keeps a margin against the context limit above as
  // the leaf category count grows (title itself is already capped at 120
  // chars by listingSchema/wtbSchema, so this rarely bites in practice).
  const truncatedTitle = title.slice(0, 100);
  const prompt = `Du skal klassifisere annonsetitler til riktig kategori for en norsk nettbasert markedsplass.
Tilgjengelige kategorier: ${leafCategories.map((c) => c.name_nb).join(", ")}
Annonsetittel: "${truncatedTitle}"
Svar med det ene kategorinavnet fra listen over som passer best. Hvis to kategorier er
omtrent like sannsynlige, svar med begge, atskilt med komma. Ingen annen tekst.`;

  // Borealis scales to zero between requests (deliberate cost tradeoff at
  // current traffic). A cold request doesn't hold the connection open until
  // the model is warm — it answers 503 "loading" near-instantly instead, or
  // the connection itself fails while the container is still booting — so we
  // poll until the model comes up or the overall budget (cold start measures
  // ~20s in practice, so 45s gives headroom) runs out. Each individual
  // attempt gets its own fixed, generous timeout (round-trip + generation
  // measured ~9s warm) rather than "whatever's left of the 45s" — otherwise
  // the attempt that finally lands after a long boot only gets a few seconds
  // to complete and gets cut off by our own timeout, not the endpoint's.
  const deadline = Date.now() + 45_000;
  const PER_ATTEMPT_TIMEOUT_MS = 20_000;
  let response: Response;
  for (;;) {
    try {
      response = await fetch(`${endpointUrl}/v1/chat/completions`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          // 0, not a small-but-nonzero value: this is a closed-set classification
          // (pick a name off the list), not creative generation, so there's no
          // upside to sampling randomness — only downside. Verified live: the
          // same title ("2024 Porsche 911 991.2") answered "Bil" consistently at
          // temperature 0, but non-deterministically produced an unrelated
          // category ("Kjøleskap og fryser") at 0.1 — the 1B model is uncertain
          // enough that any sampling noise can flip it off a correct greedy pick.
          messages: [{ role: "user", content: prompt }],
          max_tokens: 20,
          temperature: 0,
        }),
        signal: AbortSignal.timeout(PER_ATTEMPT_TIMEOUT_MS),
      });
    } catch (err) {
      // Connection-level failures (refused/reset/hang up), and this attempt's
      // own timeout aborting, are expected while the container is still
      // booting — not just the 503 the app returns once it can talk HTTP.
      // Retry those the same way, as long as we're still within budget to
      // start another attempt.
      if (Date.now() < deadline) {
        console.error("[category-suggestion-ai] fetch failed, retrying", err);
        await new Promise((resolve) => setTimeout(resolve, 1500));
        continue;
      }
      console.error("[category-suggestion-ai] fetch failed", err);
      // Cold-start budget exhausted without a usable response — a real
      // failure, not "the model looked and found nothing". Must throw
      // (not return null) so the caller's retry logic actually retries
      // instead of caching this as a valid empty answer.
      throw new Error("category-suggestion-ai: exhausted retry budget", { cause: err });
    }
    if (response.status === 503 && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      continue;
    }
    if (!response.ok) {
      console.error("[category-suggestion-ai] non-ok response", response.status);
      throw new Error(`category-suggestion-ai: non-ok response ${response.status}`);
    }
    break;
  }

  const result = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const generated = result.choices?.[0]?.message?.content?.trim();
  if (!generated) return null;

  // Up to 2 candidates — matches the confirm UI's "Er dette kategori X eller
  // Y?" pattern, offering both instead of forcing a single guess through the
  // full category list.
  const matches: CategoryRow[] = [];
  for (const part of generated.split(",")) {
    const name = part.trim();
    if (!name) continue;
    const match = byName.get(name) ?? leafCategories.find((c) => name.includes(c.name_nb));
    if (match && !matches.some((m) => m.id === match.id)) matches.push(match);
    if (matches.length === 2) break;
  }
  if (matches.length === 0) return null;

  return matches.map((match) => {
    const parent = match.parent_id
      ? (categories as CategoryRow[]).find((c) => c.id === match.parent_id)
      : null;
    return {
      category_id: match.id,
      slug: match.slug,
      name_nb: match.name_nb,
      parent_id: match.parent_id,
      parent_name_nb: parent?.name_nb ?? null,
      confidence: 0.5,
    };
  });
}
