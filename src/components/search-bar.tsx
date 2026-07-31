import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { FolderOpen, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import { findCategorySuggestion, type Category } from "@/lib/categories";
import { describeTermGroup } from "@/lib/term-groups";
import { useSearchSuggestions } from "@/features/listing-search/use-search-suggestions";

export type { Category };

/** Rotates through the input's placeholder while it's empty and unfocused, to
 * teach newcomers that the search box understands more than plain keywords
 * (exclusion, price, condition) without needing a separate onboarding step. */
const PLACEHOLDER_EXAMPLES = [
  "Hva leter du etter?",
  "Prøv: sykkel unntatt elsykkel",
  "Prøv: iPhone under 3000",
  "Prøv: sofa som ny",
  "Prøv: bil automatgir",
];

type Props = {
  q: string;
  onQChange: (v: string) => void;
  onSubmitQ: () => void;
  selectedSlugs: string[];
  onSelectedChange: (slugs: string[]) => void;
  categories: Category[];
  qMode: "all" | "any";
  onQModeChange: (v: "all" | "any") => void;
  /** Show the "Alle ord"/"Minst ett"-toggle for the "Hva" field — only
   * relevant once the advanced search panel is open, since that's where the
   * extra search lines that make the distinction matter live. */
  showQMode?: boolean;
};

/**
 * Pure text-query search field. Category selection lives solely in
 * CategoryHero/CategoryChipRow on the page — this bar used to also own a
 * drill-down category popover, but having two independent category pickers
 * visible at once was confusing, so the only category-related thing left
 * here is the "gå til kategori" hint below, which is query-driven rather
 * than a picker UI of its own.
 */
export function SearchBar({
  q,
  onQChange,
  onSubmitQ,
  selectedSlugs: _selectedSlugs,
  onSelectedChange,
  categories,
  qMode,
  onQModeChange,
  showQMode = false,
}: Props) {
  const [qFocused, setQFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const firstSuggestionRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (q || qFocused) {
      setPlaceholderIndex(0);
      return;
    }
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % PLACEHOLDER_EXAMPLES.length);
    }, 4000);
    return () => clearInterval(id);
  }, [q, qFocused]);

  // Suggest a matching category while the user types in "Hva", so people who
  // type a category name (e.g. "sykkel") discover that browsing by category
  // is also possible from the same field, without needing a separate UI.
  const qSuggestion = useMemo(() => findCategorySuggestion(categories, q), [q, categories]);
  const { data: listingSuggestions } = useSearchSuggestions(q);
  const hasDropdown = qFocused && !!(qSuggestion || listingSuggestions?.length);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitQ();
      }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
        <div className="relative flex min-w-0 flex-1 items-center gap-2 rounded-full px-4 py-1.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            onFocus={() => setQFocused(true)}
            onBlur={() => setQFocused(false)}
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "Tab") && hasDropdown && !e.shiftKey) {
                if (firstSuggestionRef.current) {
                  e.preventDefault();
                  firstSuggestionRef.current.focus();
                }
              }
            }}
            placeholder={PLACEHOLDER_EXAMPLES[placeholderIndex]}
            className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:outline-none"
            aria-autocomplete="list"
            aria-expanded={hasDropdown}
            aria-haspopup="listbox"
          />
          {hasDropdown && (
            <div
              role="listbox"
              aria-label="Søkeforslag"
              className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(360px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-md"
            >
              {qSuggestion && (
                <button
                  ref={firstSuggestionRef as React.RefObject<HTMLButtonElement>}
                  type="button"
                  role="option"
                  aria-selected="false"
                  // Mouse-down fires before the input's blur, so the click
                  // registers instead of being lost when focus leaves the field.
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onSelectedChange([qSuggestion.slug]);
                    onQChange("");
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      onSelectedChange([qSuggestion.slug]);
                      onQChange("");
                    } else if (e.key === "Escape") {
                      setQFocused(false);
                    }
                  }}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span>
                    Gå til kategori: <span className="font-medium">{qSuggestion.name_nb}</span>
                  </span>
                </button>
              )}
              {listingSuggestions?.map((s, i) => (
                <Link
                  key={s.id}
                  ref={
                    !qSuggestion && i === 0
                      ? (firstSuggestionRef as React.RefObject<HTMLAnchorElement>)
                      : undefined
                  }
                  to="/$kaupetCode"
                  params={{ kaupetCode: s.kaupet_code }}
                  role="option"
                  aria-selected="false"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => setQFocused(false)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{s.title}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        {showQMode && (
          <div className="shrink-0">
            <ModeToggle value={qMode} onChange={onQModeChange} labels={["Alle ord", "Minst ett"]} />
          </div>
        )}

        <Button
          type="submit"
          size="sm"
          className="h-9 shrink-0 rounded-full px-3 sm:px-5"
          aria-label="Søk"
        >
          <SearchIcon className="size-4" /> <span className="hidden sm:inline">Søk</span>
        </Button>
      </div>

      {showQMode && q.trim() && (
        <p className="mt-1.5 px-4 text-xs text-muted-foreground">
          {describeTermGroup({ id: "", mode: qMode, exclude: false, terms: [] })}
        </p>
      )}
    </form>
  );
}
