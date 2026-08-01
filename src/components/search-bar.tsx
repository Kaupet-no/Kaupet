import { useEffect, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import { describeTermGroup } from "@/lib/term-groups";
import { useSearchSuggestions } from "@/features/listing-search/use-search-suggestions";

/** Rotates through the input's placeholder while it's empty and unfocused, to
 * teach newcomers that the search box understands more than plain keywords
 * (exclusion, price, condition) without needing a separate onboarding step. */
const PLACEHOLDER_EXAMPLES = [
  "Hva leter du etter?",
  "Prøv: sykkel unntatt elsykkel",
  "Prøv: iPhone under 3000",
  "Prøv: sofa som ny",
  "Prøv: bil automatgir",
  "Prøv: mobiltelefon",
];

type Props = {
  q: string;
  onQChange: (v: string) => void;
  onSubmitQ: () => void;
  qMode: "all" | "any";
  onQModeChange: (v: "all" | "any") => void;
  /** Show the "Alle ord"/"Minst ett"-toggle for the "Hva" field — only
   * relevant once the advanced search panel is open, since that's where the
   * extra search lines that make the distinction matter live. */
  showQMode?: boolean;
};

/**
 * Pure text-query search field. Category selection lives in
 * CategoryHero/CategoryChipRow and in the automatic category-match effect
 * (see search-category-match.ts) — this bar used to also show a "Gå til
 * kategori" suggestion in its own dropdown, but that duplicated the
 * automatic matcher and could fire out of step with it (the automatic one
 * often applied before the suggestion was even clicked), so it was removed
 * in favor of one single category-recognition path.
 */
export function SearchBar({
  q,
  onQChange,
  onSubmitQ,
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

  const { data: listingSuggestions } = useSearchSuggestions(q);
  const hasDropdown = qFocused && !!listingSuggestions?.length;

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
              {listingSuggestions?.map((s, i) => (
                <Link
                  key={s.id}
                  ref={
                    i === 0 ? (firstSuggestionRef as React.RefObject<HTMLAnchorElement>) : undefined
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
