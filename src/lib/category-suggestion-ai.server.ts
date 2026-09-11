import {
  effectiveFiltersForCategory,
  normalizeFilter,
  type CategoryFilter,
  type CategoryNode,
} from "@/lib/category-filters";
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

  let result: { choices?: Array<{ message?: { content?: string | null } }> };
  try {
    result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
  } catch {
    console.error("[category-suggestion-ai] invalid Mistral response");
    return null;
  }
  const generated = result.choices?.[0]?.message?.content?.trim();
  if (!generated) {
    console.error("[category-suggestion-ai] invalid Mistral response");
    return null;
  }

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

const PHOTO_MAX_BYTES = 150 * 1024;
const PHOTO_MAX_TOTAL_BYTES = 450 * 1024;
const PHOTO_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
const PHOTO_CATEGORY_CACHE_TTL_MS = 60_000;
const PHOTO_UNAVAILABLE = {
  status: "unavailable" as const,
  source: "photo-ai" as const,
  categories: [],
  attributes: [],
};
type PhotoSuggestionInput = {
  operation: "identify" | "attributes";
  title?: string;
  categorySlug?: string;
  images: { mime: (typeof PHOTO_MIME_TYPES)[number]; dataUrl: string }[];
};
let photoCategoryCache: { expiresAt: number; categories: CategoryRow[] } | null = null;
let photoCategoryLoad: Promise<CategoryRow[] | null> | null = null;

async function loadPhotoCategories(): Promise<CategoryRow[] | null> {
  const now = Date.now();
  if (photoCategoryCache && photoCategoryCache.expiresAt > now)
    return photoCategoryCache.categories;
  if (photoCategoryLoad) return photoCategoryLoad;
  photoCategoryLoad = (async () => {
    try {
      const { data, error } = await supabaseAdmin
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .eq("is_hidden", false);
      if (error || !data || data.length === 0) return null;
      const categories = data as CategoryRow[];
      photoCategoryCache = {
        categories,
        expiresAt: Date.now() + PHOTO_CATEGORY_CACHE_TTL_MS,
      };
      return categories;
    } finally {
      photoCategoryLoad = null;
    }
  })();
  return photoCategoryLoad;
}

function boundedPhotoImages(images: PhotoSuggestionInput["images"]) {
  let totalBytes = 0;
  const valid: PhotoSuggestionInput["images"] = [];
  for (const image of images) {
    const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/u.exec(
      image.dataUrl,
    );
    if (!match || match[1] !== image.mime || match[2].length % 4 !== 0) continue;
    try {
      const bytes = atob(match[2]).length;
      if (bytes === 0 || bytes > PHOTO_MAX_BYTES || totalBytes + bytes > PHOTO_MAX_TOTAL_BYTES) {
        continue;
      }
      totalBytes += bytes;
      valid.push(image);
    } catch {
      // Invalid base64 is a manual-fallback case, not a provider error.
    }
  }
  return valid;
}

function photoCategoryResult(
  categories: CategoryRow[],
  slugs: string[],
): Array<{
  category_id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  parent_name_nb: string | null;
}> {
  const bySlug = new Map(categories.map((category) => [category.slug, category]));
  const byId = new Map(categories.map((category) => [category.id, category]));
  const seen = new Set<string>();
  return slugs.flatMap((slug) => {
    const category = bySlug.get(slug);
    if (!category || seen.has(category.id)) return [];
    seen.add(category.id);
    const parent = category.parent_id ? byId.get(category.parent_id) : undefined;
    return [
      {
        category_id: category.id,
        slug: category.slug,
        name_nb: category.name_nb,
        parent_id: category.parent_id,
        parent_name_nb: parent?.name_nb ?? null,
      },
    ];
  });
}

function safePhotoAttributeKey(key: string): boolean {
  return !/(email|person|location|address|postal|coordinate|registration|regnr|freetext)/iu.test(
    key,
  );
}

function allowedPhotoAttribute(
  candidate: { key: string; value: string | number | boolean },
  filters: CategoryFilter[],
): boolean {
  if (!safePhotoAttributeKey(candidate.key)) return false;
  const filter = filters.find((item) => item.key === candidate.key);
  if (
    !filter ||
    filter.type === "text" ||
    filter.type === "range" ||
    filter.type === "multiselect"
  ) {
    return false;
  }
  if (filter.type === "number" && typeof candidate.value !== "number") return false;
  if (filter.type === "boolean" && typeof candidate.value !== "boolean") return false;
  if (
    (filter.type === "select" ||
      filter.type === "brand_select" ||
      filter.type === "model_select") &&
    typeof candidate.value !== "string"
  ) {
    return false;
  }
  const options = filter.options;
  if (!Array.isArray(options)) return true;
  return options.some((option) => {
    if (typeof option === "string" || typeof option === "number") return option === candidate.value;
    if (option && typeof option === "object" && "value" in option) {
      return option.value === candidate.value;
    }
    return false;
  });
}

export async function suggestListingFromPhotosAi(input: unknown) {
  const parsed = z
    .object({
      operation: z.enum(["identify", "attributes"]),
      title: z.string().trim().max(120).optional(),
      categorySlug: z.string().trim().max(100).optional(),
      images: z
        .array(
          z.object({
            mime: z.enum(PHOTO_MIME_TYPES),
            dataUrl: z.string().max(220_000),
          }),
        )
        .min(1)
        .max(3),
    })
    .strict()
    .safeParse(input);
  if (!parsed.success || process.env.MISTRAL_PHOTO_SUGGESTIONS_ENABLED !== "true") {
    return PHOTO_UNAVAILABLE;
  }
  const images = boundedPhotoImages(parsed.data.images);
  if (images.length === 0) return PHOTO_UNAVAILABLE;

  const categoryRows = await loadPhotoCategories();
  if (!categoryRows) return PHOTO_UNAVAILABLE;
  const parentIds = new Set(
    categoryRows.flatMap((category) => (category.parent_id ? [category.parent_id] : [])),
  );
  const leafCategories = categoryRows.filter((category) => !parentIds.has(category.id));
  if (leafCategories.length === 0) return PHOTO_UNAVAILABLE;

  let filters: CategoryFilter[] = [];
  if (parsed.data.operation === "attributes") {
    const category = categoryRows.find((candidate) => candidate.slug === parsed.data.categorySlug);
    if (!category) return PHOTO_UNAVAILABLE;
    const categoryById = new Map<string, CategoryNode>(
      categoryRows.map((candidate) => [candidate.id, candidate]),
    );
    const categoryIds = new Set<string>();
    let current: CategoryNode | undefined = category;
    while (current && !categoryIds.has(current.id)) {
      categoryIds.add(current.id);
      current = current.parent_id ? categoryById.get(current.parent_id) : undefined;
    }
    const { data: filterRows, error: filterError } = await supabaseAdmin
      .from("category_filters")
      .select(
        "id, category_id, key, label_nb, type, unit, options, sort_order, is_primary, depends_on_key, depends_on_value, depends_on_not_value, is_optional",
      )
      .in("category_id", [...categoryIds]);
    if (filterError || !filterRows) return PHOTO_UNAVAILABLE;
    filters = effectiveFiltersForCategory(
      category.id,
      filterRows.map((row) => normalizeFilter(row)),
      categoryById,
    );
  }

  const candidateBlock = leafCategories
    .map((category) => `${category.name_nb} [${category.slug}]`)
    .join(", ");
  const prompt =
    parsed.data.operation === "identify"
      ? `Finn én eller to sannsynlige bladkategorier for bildene på en norsk markedsplass.
Velg bare sluger fra kandidatlisten. Foreslå også en kort tittel hvis bildet viser én tydelig gjenstand.
Ikke ta med personopplysninger, adresse, registreringsnummer eller kontaktinformasjon.
Kandidater: ${candidateBlock}`
      : `Finn bare tydelige, synlige verdier for tillatte kategorifelt i bildene.
Velg kun felt og enumverdier fra listen. Ikke gjett, og ikke returner fritekst, personopplysninger,
adresse, registreringsnummer eller kontaktinformasjon.
Tillatte felt: ${filters
          .map(
            (filter) =>
              `${filter.key} (${filter.type}${filter.options?.length ? `: ${filter.options.map((option) => option.value).join("|")}` : ""})`,
          )
          .join(", ")}`;
  const content = [
    {
      type: "text",
      text: `${prompt}${parsed.data.title ? `\nStarttekst: ${parsed.data.title}` : ""}`,
    },
    ...images.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } })),
  ];
  const responseSchema =
    parsed.data.operation === "identify"
      ? {
          type: "object",
          properties: {
            categories: {
              type: "array",
              items: { type: "string", enum: leafCategories.map((category) => category.slug) },
              minItems: 1,
              maxItems: 2,
            },
            title: { type: "string", maxLength: 120 },
          },
          required: ["categories"],
          additionalProperties: false,
        }
      : {
          type: "object",
          properties: {
            attributes: {
              type: "array",
              maxItems: 8,
              items: {
                type: "object",
                properties: {
                  key: { type: "string", enum: filters.map((filter) => filter.key) },
                  value: { type: ["string", "number", "boolean"] },
                },
                required: ["key", "value"],
                additionalProperties: false,
              },
            },
          },
          required: ["attributes"],
          additionalProperties: false,
        };
  if (!process.env.MISTRAL_API_KEY) return PHOTO_UNAVAILABLE;

  try {
    const response = await fetch("https://api.eu.mistral.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.MISTRAL_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "mistral-small-2603",
        messages: [{ role: "user", content }],
        max_tokens: 256,
        reasoning_effort: "none",
        temperature: 0,
        response_format: {
          type: "json_schema",
          json_schema: {
            name:
              parsed.data.operation === "identify"
                ? "photo_category_suggestion"
                : "photo_attribute_suggestion",
            strict: true,
            schema: responseSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(5_000),
    });
    if (!response.ok) return PHOTO_UNAVAILABLE;
    const result = (await response.json()) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const generated = result.choices?.[0]?.message?.content;
    if (!generated) return PHOTO_UNAVAILABLE;
    if (parsed.data.operation === "identify") {
      const output = z
        .object({
          categories: z.array(z.string()).min(1).max(2),
          title: z.string().max(120).optional(),
        })
        .strict()
        .parse(JSON.parse(generated));
      const suggestions = photoCategoryResult(categoryRows, output.categories);
      return suggestions.length > 0
        ? {
            status: "pending" as const,
            source: "photo-ai" as const,
            categories: suggestions,
            ...(output.title ? { title: output.title } : {}),
          }
        : PHOTO_UNAVAILABLE;
    }
    const output = z
      .object({
        attributes: z
          .array(
            z.object({
              key: z.string(),
              value: z.union([z.string().max(80), z.number().finite(), z.boolean()]),
            }),
          )
          .max(8),
      })
      .strict()
      .parse(JSON.parse(generated));
    const attributes = output.attributes.filter((candidate) =>
      allowedPhotoAttribute(candidate, filters),
    );
    return attributes.length > 0
      ? { status: "pending" as const, source: "photo-ai" as const, attributes }
      : PHOTO_UNAVAILABLE;
  } catch {
    return PHOTO_UNAVAILABLE;
  }
}
