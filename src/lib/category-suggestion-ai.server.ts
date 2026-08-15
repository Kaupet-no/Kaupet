import { z } from "zod";

const inputSchema = z.object({ title: z.string().min(3).max(200) });

type CategoryRow = { id: string; slug: string; name_nb: string; parent_id: string | null };

/**
 * AI fallback for `suggestCategoryForTitle` (category-suggestion.functions.ts),
 * used only when the vote-based RPC has no confident match — e.g. a title
 * with no prior listing history. Prompts the borealis-1b endpoint to pick a
 * category name from the full list, then validates the answer against real
 * categories before returning it (never trust model output directly).
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

  const byName = new Map((categories as CategoryRow[]).map((c) => [c.name_nb, c]));
  const prompt = `Du skal klassifisere annonsetitler til riktig kategori for den norske markedsplassen Kaupet.
Tilgjengelige kategorier: ${categories.map((c) => c.name_nb).join(", ")}
Annonsetittel: "${title}"
Svar kun med det eksakte kategorinavnet fra listen over, ingen annen tekst.`;

  const response = await fetch(`${endpointUrl}/v1/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: prompt }],
      max_tokens: 20,
      temperature: 0.1,
    }),
  });
  if (!response.ok) return null;

  const result = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  const generated = result.choices?.[0]?.message?.content?.trim();
  if (!generated) return null;

  const match =
    byName.get(generated) ??
    (categories as CategoryRow[]).find((c) => generated.includes(c.name_nb));
  if (!match) return null;

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
}
