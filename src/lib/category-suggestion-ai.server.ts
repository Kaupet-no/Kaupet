import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";

const inputSchema = z.object({ title: z.string().min(3).max(200) });

type CategoryRow = { id: string; slug: string; name_nb: string; parent_id: string | null };

function categoryCandidates(categories: CategoryRow[], title: string) {
  const byId = new Map(categories.map((category) => [category.id, category]));
  const roots = categories.filter((category) => !category.parent_id);
  const leaves = categories.filter(
    (category) => !categories.some((c) => c.parent_id === category.id),
  );
  const titleWords = new Set(title.toLocaleLowerCase("nb-NO").match(/[\p{L}\p{N}]+/gu) ?? []);

  function rootOf(category: CategoryRow) {
    let current = category;
    while (current.parent_id) {
      current = byId.get(current.parent_id) ?? current;
      if (!current.parent_id) break;
    }
    return current;
  }

  // Keep every leaf available: Mistral Small 4 has enough context for the
  // complete category list, and lexical pruning can hide the correct answer.
  return roots.flatMap((root) =>
    leaves
      .filter((leaf) => rootOf(leaf).id === root.id)
      .sort((a, b) => {
        const score = (category: CategoryRow) =>
          [category.name_nb, root.name_nb]
            .join(" ")
            .toLocaleLowerCase("nb-NO")
            .match(/[\p{L}\p{N}]+/gu)
            ?.reduce((sum, word) => sum + (titleWords.has(word) ? 1 : 0), 0) ?? 0;
        return score(b) - score(a) || a.name_nb.localeCompare(b.name_nb, "nb");
      }),
  );
}

/**
 * AI fallback for `suggestCategoryForTitle` (category-suggestion.functions.ts),
 * used only when the vote-based RPC has no confident match. Prompts Mistral
 * Small 4 to pick one or two category slugs from the full leaf list, then
 * validates the answer(s) against real categories before returning them.
 * Returns null if nothing validated, otherwise 1-2 candidates.
 */
export async function suggestCategoryForTitleAi(input: unknown) {
  const { title } = inputSchema.parse(input);

  const token = process.env.MISTRAL_API_KEY;
  if (!token) return null;

  const { data: categories, error } = await supabaseAdmin
    .from("categories")
    .select("id, slug, name_nb, parent_id")
    .eq("is_hidden", false);
  if (error || !categories || categories.length === 0) return null;

  // Motorsport is intentionally excluded: users normally mean Bil or MC for
  // these titles, and the confirmation UI handles the Motorsport alternative.
  const parentIds = new Set(
    (categories as CategoryRow[]).map((c) => c.parent_id).filter((id): id is string => !!id),
  );
  const leafCategories = (categories as CategoryRow[]).filter(
    (c) => !parentIds.has(c.id) && c.name_nb !== "Motorsport",
  );
  if (leafCategories.length === 0) return null;

  const truncatedTitle = title.slice(0, 100);
  const candidates = categoryCandidates(
    (categories as CategoryRow[]).filter((c) => c.name_nb !== "Motorsport"),
    truncatedTitle,
  );
  const bySlug = new Map(candidates.map((c) => [c.slug, c]));
  if (candidates.length === 0) return null;

  const examples: string[] = [];
  if (candidates.some((c) => c.name_nb === "Bil")) {
    examples.push('"Volvo XC40 2019, dieselmotor" -> bil', '"BMW 320d 2015" -> bil');
  }
  if (candidates.some((c) => c.name_nb === "Motorsykkel")) {
    examples.push('"Suzuki GSXR 750" -> motorsykkel', '"Honda CBR 600RR 2018" -> motorsykkel');
  }
  const examplesBlock = examples.length ? `\nEksempler:\n${examples.join("\n")}\n` : "";
  const candidateBlock = candidates.map((c) => `${c.name_nb} [${c.slug}]`).join(", ");

  const prompt = `Klassifiser annonsetittelen til én eller to passende bladkategorier på en norsk markedsplass.
Returner kun JSON på formen {"categories":["slug"]}. Velg bare sluger fra kandidatlisten.
Hvis to kategorier er omtrent like sannsynlige, returner begge. Ikke forklar valget.
Kandidater: ${candidateBlock}
${examplesBlock}Annonsetittel: "${truncatedTitle}"`;

  let response: Response;
  try {
    response = await fetch("https://api.eu.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "mistral-small-2603",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 32,
        reasoning_effort: "none",
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "category_suggestion",
            strict: true,
            schema: {
              type: "object",
              properties: {
                categories: {
                  type: "array",
                  items: { type: "string", enum: candidates.map((candidate) => candidate.slug) },
                  minItems: 1,
                  maxItems: 2,
                },
              },
              required: ["categories"],
              additionalProperties: false,
            },
          },
        },
      }),
      signal: AbortSignal.timeout(2_000),
    });
  } catch (error) {
    console.error("[category-suggestion-ai] Mistral request failed", error);
    return null;
  }

  if (!response.ok) {
    console.error("[category-suggestion-ai] Mistral request failed", response.status);
    return null;
  }

  const result = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const generated = result.choices?.[0]?.message?.content?.trim();
  if (!generated) return null;

  let output: { categories: string[] };
  try {
    output = z
      .object({ categories: z.array(z.string()).min(1).max(2) })
      .parse(JSON.parse(generated));
  } catch {
    console.error("[category-suggestion-ai] invalid Mistral response");
    return null;
  }

  const matches: CategoryRow[] = [];
  for (const slug of output.categories) {
    const match = bySlug.get(slug);
    if (match && !matches.some((candidate) => candidate.id === match.id)) {
      matches.push(match);
    }
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
