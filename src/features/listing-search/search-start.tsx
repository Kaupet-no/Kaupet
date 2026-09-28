import { useState } from "react";
import { Bell, Clock } from "lucide-react";

import type { Category } from "@/lib/categories";
import { CategoryIcon } from "@/lib/category-icons";
import type { SavedSearch } from "@/lib/saved-searches";
import {
  searchStartRowClass,
  useSavedSearchesWithUnread,
} from "@/features/listing-search/use-saved-searches-with-unread";
import { getSearchHistory } from "@/features/listing-search/search-panel/search-history";

export function SavedSearchRow({
  saved,
  unread,
  onPick,
}: {
  saved: SavedSearch;
  unread: number;
  onPick: (saved: SavedSearch) => void;
}) {
  return (
    <button type="button" onClick={() => onPick(saved)} className={searchStartRowClass}>
      <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-primary">
        <Bell className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{saved.name}</span>
      {unread > 0 && (
        <span className="shrink-0 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-brand-foreground">
          {unread > 99 ? "99+" : unread} nye
        </span>
      )}
    </button>
  );
}

/**
 * Søk-fanens startflate: resultatsiden uten kriterier på native. Lagrede og
 * nylige søk, og hovedkategoriene — det søkeskuffen fra bunnmenyen viste før,
 * nå på en ordentlig side som fanen kan gå tilbake til. De nyeste annonsene
 * står under, som vanlige resultater.
 */
export function SearchStart({
  categories,
  onSubmitQuery,
  onPickCategory,
  onPickSavedSearch,
}: {
  categories: Category[];
  onSubmitQuery: (text: string) => void;
  onPickCategory: (category: Category) => void;
  onPickSavedSearch: (saved: SavedSearch) => void;
}) {
  const saved = useSavedSearchesWithUnread(3);
  const [history] = useState(getSearchHistory);
  const mainCategories = categories.filter((category) => category.parent_id == null);

  return (
    <div className="mt-4 space-y-6">
      {saved.length > 0 && (
        <section aria-labelledby="start-saved-heading">
          <h2 id="start-saved-heading" className="mb-2 font-display text-base tracking-tight">
            Lagrede søk
          </h2>
          <div className="flex flex-col gap-2">
            {saved.map(({ saved: search, unread }) => (
              <SavedSearchRow
                key={search.id}
                saved={search}
                unread={unread}
                onPick={onPickSavedSearch}
              />
            ))}
          </div>
        </section>
      )}

      {history.length > 0 && (
        <section aria-labelledby="start-recent-heading">
          <h2 id="start-recent-heading" className="mb-2 font-display text-base tracking-tight">
            Nylige søk
          </h2>
          <div className="flex flex-wrap gap-2">
            {history.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => onSubmitQuery(item)}
                className="native-touch-target inline-flex min-h-9 items-center gap-1.5 rounded-full border border-border bg-card px-3 text-sm"
              >
                <Clock className="size-3.5 text-muted-foreground" aria-hidden="true" />
                {item}
              </button>
            ))}
          </div>
        </section>
      )}

      {mainCategories.length > 0 && (
        <section aria-labelledby="start-categories-heading">
          <h2 id="start-categories-heading" className="mb-2 font-display text-base tracking-tight">
            Kategorier
          </h2>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {mainCategories.map((category) => (
              <button
                key={category.id}
                type="button"
                onClick={() => onPickCategory(category)}
                className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-xl bg-card px-1.5 py-3 text-center transition active:scale-[0.97] active:bg-muted"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <CategoryIcon iconName={category.icon} className="size-5" aria-hidden="true" />
                </span>
                <span className="text-xs leading-tight text-balance">{category.name_nb}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      <h2 className="font-display text-base tracking-tight">Nye annonser</h2>
    </div>
  );
}
