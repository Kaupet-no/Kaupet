import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Search as SearchIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import { TermGroupEditor } from "@/components/term-group-editor";
import { describeTermGroup, type TermGroup } from "@/lib/term-groups";
import { useSearchSuggestions } from "@/features/listing-search/use-search-suggestions";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";

/** Teaches newcomers that the search box understands more than plain
 * keywords (exclusion, price, condition) — kept as fixed syntax examples
 * since they demonstrate query operators, not searchable vocabulary, so
 * they don't belong in the admin-editable `default_search_examples` list
 * (see useDefaultSearchExamples, which supplies the vocabulary examples
 * mixed in below). */
const SYNTAX_EXAMPLES = [
  "Prøv: sykkel unntatt elsykkel",
  "Prøv: iPhone under 3000",
  "Prøv: sofa som ny",
  "Prøv: bil automatgir",
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
  /** Extra search lines ("Flere søkelinjer") — optional so callers that don't
   * need them (none currently) aren't forced to wire up empty state. When
   * provided, "Presist søk" reveals both this and `qMode`. */
  extraGroups?: TermGroup[];
  onExtraGroupsChange?: (groups: TermGroup[]) => void;
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
  extraGroups,
  onExtraGroupsChange,
}: Props) {
  const [qFocused, setQFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const showMoreButton = !showQMode && extraGroups != null && onExtraGroupsChange != null;
  const moreCount = (extraGroups?.length ?? 0) + (qMode === "any" ? 1 : 0);
  const firstSuggestionRef = useRef<HTMLElement>(null);

  const defaultSearchExamples = useDefaultSearchExamples();
  const placeholderExamples = useMemo(
    () => [
      "Hva leter du etter?",
      ...SYNTAX_EXAMPLES,
      ...defaultSearchExamples.slice(0, 3).map((w) => `Prøv: ${w}`),
    ],
    [defaultSearchExamples],
  );

  useEffect(() => {
    if (q || qFocused) return;
    const id = setInterval(() => {
      setPlaceholderIndex((i) => (i + 1) % placeholderExamples.length);
    }, 4000);
    return () => clearInterval(id);
  }, [q, qFocused, placeholderExamples.length]);

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
            onFocus={() => {
              setPlaceholderIndex(0);
              setQFocused(true);
            }}
            onBlur={() => setQFocused(false)}
            onKeyDown={(e) => {
              if ((e.key === "ArrowDown" || e.key === "Tab") && hasDropdown && !e.shiftKey) {
                if (firstSuggestionRef.current) {
                  e.preventDefault();
                  firstSuggestionRef.current.focus();
                }
              }
            }}
            placeholder={placeholderExamples[placeholderIndex % placeholderExamples.length]}
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

      {showMoreButton && (
        <Collapsible
          key={moreCount > 0 ? "active" : "default"}
          defaultOpen={moreCount > 0}
          className="px-4"
        >
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group gap-1 px-0 text-primary"
            >
              Presist søk{moreCount > 0 ? ` (${moreCount})` : ""}
              <ChevronDown
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="space-y-4 rounded-xl border border-border bg-card p-4">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-sm font-medium">Søkeordmodus</Label>
              <ModeToggle
                value={qMode}
                onChange={onQModeChange}
                labels={["Alle ord", "Minst ett"]}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-sm font-medium">Flere søkelinjer</Label>
              <TermGroupEditor groups={extraGroups ?? []} onChange={onExtraGroupsChange!} />
            </div>
          </CollapsibleContent>
        </Collapsible>
      )}

      {showQMode && q.trim() && (
        <p className="mt-1.5 px-4 text-xs text-muted-foreground">
          {describeTermGroup({ id: "", mode: qMode, exclude: false, terms: [] })}
        </p>
      )}
    </form>
  );
}
