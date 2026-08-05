import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { suggestKeywordsForListing } from "@/lib/keyword-suggestion.functions";
import { matchWtbListingsForListing } from "@/lib/wtb-listings.functions";
import type { AttributeMap } from "@/components/attribute-fields";

export const SIMILAR_STOPWORDS = new Set([
  "og",
  "er",
  "en",
  "et",
  "ei",
  "i",
  "på",
  "med",
  "til",
  "av",
  "for",
  "som",
  "fra",
  "har",
  "den",
  "det",
  "de",
  "vi",
  "du",
  "kan",
  "ikke",
  "seg",
  "han",
  "hun",
  "men",
  "om",
  "så",
  "ut",
  "enn",
  "da",
  "når",
  "at",
  "dem",
  "sin",
  "hva",
  "ved",
  "var",
  "ny",
  "nye",
  "god",
  "fin",
  "fine",
  "pen",
  "pent",
  "pene",
  "lite",
  "litt",
  "stor",
  "store",
  "liten",
  "billig",
  "rimelig",
  "rask",
  "raskt",
  "gammel",
  "brukt",
  "selger",
  "selges",
  "kjøper",
  "kjøpes",
  "pris",
]);

/**
 * Shared core behind useListingTitleHints (create) and useEditListingHints
 * (edit): debounces the title, then derives "similar listings already up"
 * hints, a WTB (want-to-buy) price match, and keyword suggestions for the
 * description. The two wrapper hooks differ only in whether a category
 * suggestion is layered on top (create-only) and whether the listing being
 * edited is excluded from its own similar-listings search (edit-only) — both
 * previously duplicated this whole block verbatim.
 */
export function useTitleBasedListingHints(params: {
  title: string;
  description: string | undefined;
  categoryId: string;
  excludeListingId?: string;
  /** Prisstegets pågående verdier — brukes kun til det attributtbaserte
   * ØK-treff-banneret (wtbMatch), ikke til de andre hintene i denne hooken. */
  priceNok?: number | undefined;
  isFree?: boolean;
  attributes?: AttributeMap;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
}) {
  const {
    title,
    description,
    categoryId,
    excludeListingId,
    priceNok,
    isFree,
    attributes,
    setValue,
  } = params;

  const [debouncedTitle, setDebouncedTitle] = useState("");
  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedTitle(title ?? ""), 800);
    return () => window.clearTimeout(t);
  }, [title]);

  const { data: similarListings } = useQuery({
    queryKey: ["similar-listings", categoryId, debouncedTitle],
    enabled: debouncedTitle.length >= 5 && !!categoryId,
    staleTime: 60_000,
    queryFn: async () => {
      const significantWords = debouncedTitle
        .toLowerCase()
        .replace(/[^a-zæøå0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length >= 2 && !SIMILAR_STOPWORDS.has(w));
      if (significantWords.length === 0) return [];
      let q = supabase
        .from("listings")
        .select("id, title, price_nok, is_free, city")
        .eq("category_id", categoryId)
        .eq("status", "active");
      if (excludeListingId) q = q.neq("id", excludeListingId);
      const { data } = await q
        .textSearch("search_vector", significantWords.join(" "), {
          config: "norwegian",
          type: "plain",
        })
        .limit(3);
      return data ?? [];
    },
  });

  // Egen debounce for det attributtbaserte ØK-treff-banneret: den skal reagere
  // på pris/attributter i tillegg til tittel (ofte kjent først i pris-steget,
  // etter at kategori/attributter allerede er fylt ut), men uten å påvirke
  // debouncedTitle-drevne similarListings/keywordSuggestions ovenfor.
  const [debouncedWtbInputs, setDebouncedWtbInputs] = useState({
    title,
    priceNok,
    isFree,
    attributes,
  });
  useEffect(() => {
    const t = window.setTimeout(
      () => setDebouncedWtbInputs({ title, priceNok, isFree, attributes }),
      800,
    );
    return () => window.clearTimeout(t);
  }, [title, priceNok, isFree, attributes]);

  const matchWtbFn = useServerFn(matchWtbListingsForListing);
  const { data: wtbMatch } = useQuery({
    queryKey: [
      "wtb-match",
      categoryId ?? null,
      debouncedWtbInputs.title,
      debouncedWtbInputs.priceNok ?? null,
      debouncedWtbInputs.isFree ?? false,
      debouncedWtbInputs.attributes ?? null,
    ],
    enabled: (debouncedWtbInputs.title ?? "").length >= 3,
    staleTime: 30_000,
    queryFn: () =>
      matchWtbFn({
        data: {
          title: debouncedWtbInputs.title ?? "",
          description,
          category_id: categoryId || null,
          price_nok: debouncedWtbInputs.priceNok ?? null,
          is_free: debouncedWtbInputs.isFree ?? false,
          attributes: debouncedWtbInputs.attributes ?? {},
        },
      }),
  });

  const { data: keywordSuggestions, isFetching: keywordsFetching } = useQuery({
    queryKey: ["keyword-suggestions", categoryId, debouncedTitle],
    enabled: !!categoryId && debouncedTitle.length >= 3,
    staleTime: 120_000,
    queryFn: () =>
      suggestKeywordsForListing({ data: { title: debouncedTitle, category_id: categoryId! } }),
  });

  function appendTagToDescription(tag: string) {
    const current = (description ?? "").trimEnd();
    const next = current ? `${current} ${tag}` : tag;
    setValue("description", next, { shouldTouch: false });
  }

  return {
    similarListings,
    wtbMatch,
    keywordSuggestions,
    keywordsFetching,
    appendTagToDescription,
  };
}
