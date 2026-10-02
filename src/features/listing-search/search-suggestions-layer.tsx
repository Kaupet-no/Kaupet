import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Clock, Search as SearchIcon } from "lucide-react";

import { findCategorySuggestion, type Category } from "@/lib/categories";
import { CategoryIcon } from "@/lib/category-icons";
import {
  listSavedSearches,
  listUnreadCountsBySearch,
  type SavedSearch,
} from "@/lib/saved-searches";
import { useAuth } from "@/hooks/use-auth";
import { useSearchSuggestions } from "@/features/listing-search/use-search-suggestions";
import {
  SearchSuggestionList,
  type SearchSuggestionGroup,
} from "@/features/listing-search/search-suggestion-list";
import { getSearchHistory } from "@/features/listing-search/search-panel/search-history";

type Props = {
  q: string;
  categories: Category[];
  onSubmitQuery: (text: string) => void;
  onPickCategory: (category: Category) => void;
  onPickSavedSearch: (saved: SavedSearch) => void;
  /** Kategorien søket allerede er avgrenset til — foreslås ikke på nytt. */
  currentCategorySlugs?: string[];
};

const icon = (Icon: typeof SearchIcon, muted = false) => (
  <Icon
    className={`size-4 shrink-0 ${muted ? "text-muted-foreground" : "text-primary"}`}
    aria-hidden="true"
  />
);

/**
 * Forslag under et ekte søkefelt (forsiden og resultatsidens søkepille), mens
 * feltet har fokus. Tomt felt viser nylige og lagrede søk — lagrede søk med
 * antall nye treff, som er den raskeste veien tilbake. Med tekst foreslås
 * kategorien først, slik at tolkningen «sykkel → Sykler» synes før den skjer.
 * Samme innhold som søkepanelets query-modus, uten å bytte flate.
 */
export function SearchSuggestionsLayer({
  q,
  categories,
  onSubmitQuery,
  onPickCategory,
  onPickSavedSearch,
  currentCategorySlugs = [],
}: Props) {
  const { user } = useAuth();
  const trimmed = q.trim();
  // Leses når laget monteres (feltet får fokus), ikke per tastetrykk.
  const [history] = useState(getSearchHistory);
  const { data: listingSuggestions = [] } = useSearchSuggestions(trimmed);
  // Samme nøkler som /mine-sok og søkepanelet, så cachen deles.
  const { data: savedSearches = [] } = useQuery({
    queryKey: ["saved-searches"],
    queryFn: listSavedSearches,
    enabled: !!user,
  });
  const { data: unreadCounts } = useQuery({
    queryKey: ["saved-search-unread-counts"],
    queryFn: listUnreadCountsBySearch,
    enabled: !!user,
  });

  const categorySuggestion = useMemo(() => {
    if (trimmed.length < 2) return null;
    const needle = trimmed.toLocaleLowerCase();
    const match =
      categories.find((category) => category.name_nb.toLocaleLowerCase() === needle) ??
      findCategorySuggestion(categories, trimmed);
    return match && !currentCategorySlugs.includes(match.slug) ? match : null;
  }, [trimmed, categories, currentCategorySlugs]);

  /** Nærmeste forelder med et annet navn — «Sykkel» ligger under «Sykkel». */
  const parentName = (category: Category) => {
    let parent = categories.find((candidate) => candidate.id === category.parent_id);
    while (parent && parent.name_nb === category.name_nb) {
      const next = parent.parent_id;
      parent = categories.find((candidate) => candidate.id === next);
    }
    return parent?.name_nb;
  };

  const groups: SearchSuggestionGroup[] = trimmed
    ? [
        {
          label: "Kategori",
          items: categorySuggestion
            ? [
                {
                  id: `category:${categorySuggestion.id}`,
                  label: parentName(categorySuggestion)
                    ? `${categorySuggestion.name_nb} i ${parentName(categorySuggestion)}`
                    : categorySuggestion.name_nb,
                  icon: (
                    <CategoryIcon
                      iconName={categorySuggestion.icon}
                      className="size-4 shrink-0 text-primary"
                      aria-hidden="true"
                    />
                  ),
                  onSelect: () => onPickCategory(categorySuggestion),
                },
              ]
            : [],
        },
        {
          label: "Søk etter",
          items: [
            {
              id: "query",
              label: `«${trimmed}»`,
              icon: icon(SearchIcon),
              onSelect: () => onSubmitQuery(trimmed),
            },
          ],
        },
        {
          label: "Annonser",
          items: listingSuggestions.map((suggestion) => ({
            id: suggestion.id,
            label: suggestion.title,
            icon: icon(SearchIcon, true),
            kaupetCode: suggestion.kaupet_code,
            onSelect: () => undefined,
          })),
        },
      ]
    : [
        {
          label: "Lagrede søk",
          items: savedSearches.slice(0, 3).map((saved) => {
            const unread = unreadCounts?.get(saved.id) ?? 0;
            return {
              id: `saved:${saved.id}`,
              label:
                unread > 0 ? `${saved.name} · ${unread > 99 ? "99+" : unread} nye` : saved.name,
              icon: icon(Bell),
              onSelect: () => onPickSavedSearch(saved),
            };
          }),
        },
        {
          label: "Nylige søk",
          items: history.map((item) => ({
            id: `history:${item}`,
            label: item,
            icon: icon(Clock, true),
            onSelect: () => onSubmitQuery(item),
          })),
        },
      ];

  return <SearchSuggestionList groups={groups} variant="dropdown" />;
}
