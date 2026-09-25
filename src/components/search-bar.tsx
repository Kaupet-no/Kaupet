import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  FolderOpen,
  Search as SearchIcon,
  SlidersHorizontal,
  Waypoints,
} from "lucide-react";
import { useSearchSuggestions } from "@/features/listing-search/use-search-suggestions";
import { ANNONSER_SEARCH_INPUT_ID } from "@/features/listing-search/search-input-id";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchRuleFields } from "@/components/search-rule-fields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import type { TermGroup } from "@/lib/term-groups";
import { useDefaultSearchExamples } from "@/hooks/use-default-search-examples";
import {
  SearchSuggestionList,
  type SearchSuggestionGroup,
} from "@/features/listing-search/search-suggestion-list";

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
  /** Show the word matching selector inside the search field. */
  showQMode?: boolean;
  /** Extra search rules — optional so callers without a search builder keep
   * the plain query field. */
  extraGroups?: TermGroup[];
  onExtraGroupsChange?: (groups: TermGroup[]) => void;
  onOpenRules?: () => void;
  rulesActive?: boolean;
  categorySuggestion?: { label: string; onSelect: () => void };
  filterSuggestions?: Array<{ id: string; label: string; onSelect: () => void }>;
};

/**
 * Pure text-query search field. Category selection lives in
 * CategoryHero and in the automatic category-match effect
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
  onOpenRules,
  rulesActive = false,
  categorySuggestion,
  filterSuggestions = [],
}: Props) {
  const [qFocused, setQFocused] = useState(false);
  const [placeholderIndex, setPlaceholderIndex] = useState(0);
  const showSearchBuilder = extraGroups != null && onExtraGroupsChange != null;
  const moreCount =
    new Set((extraGroups ?? []).map((group) => (group.exclude ? "exclude" : group.mode))).size +
    (!showQMode && qMode === "any" ? 1 : 0);
  const ruleTypes = ["all", "any", "exclude"] as const;
  const ruleLabels = {
    all: "Skal inneholde",
    any: "Kan inneholde",
    exclude: "Skal ikke inneholde",
  };
  const termsFor = (type: (typeof ruleTypes)[number]) => [
    ...(type === qMode ? q.trim().split(/\s+/).filter(Boolean) : []),
    ...(extraGroups ?? [])
      .filter((group) =>
        type === "exclude" ? group.exclude : !group.exclude && group.mode === type,
      )
      .flatMap((group) => group.terms),
  ];
  const queryDisplay =
    extraGroups?.some((group) => group.terms.length) && !qFocused
      ? [
          termsFor(qMode).join(" "),
          ...ruleTypes.flatMap((type) =>
            type === qMode
              ? []
              : termsFor(type).length
                ? [`${ruleLabels[type]}: ${termsFor(type).join(", ")}`]
                : [],
          ),
        ]
          .filter(Boolean)
          .join(" · ")
      : q;
  const firstSuggestionRef = useRef<HTMLElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

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
  const hasSubmitSuggestion = q.trim().length >= 2;
  const hasDropdown =
    qFocused &&
    (hasSubmitSuggestion ||
      !!listingSuggestions?.length ||
      !!categorySuggestion ||
      filterSuggestions.length > 0);
  const suggestionGroups: SearchSuggestionGroup[] = [
    ...(hasSubmitSuggestion
      ? [
          {
            label: "Søk etter",
            items: [
              {
                id: "query",
                label: `Søk etter «${q.trim()}»`,
                icon: <SearchIcon className="size-4 shrink-0 text-primary" aria-hidden="true" />,
                onSelect: () => {
                  onSubmitQ();
                  setQFocused(false);
                },
              },
            ],
          },
        ]
      : []),
    ...(categorySuggestion
      ? [
          {
            label: "Kategori",
            items: [
              {
                id: "category",
                label: categorySuggestion.label,
                icon: <FolderOpen className="size-4 shrink-0 text-primary" aria-hidden="true" />,
                onSelect: () => {
                  categorySuggestion.onSelect();
                  setQFocused(false);
                },
              },
            ],
          },
        ]
      : []),
    ...(filterSuggestions.length > 0
      ? [
          {
            label: "Filter",
            items: filterSuggestions.map((suggestion) => ({
              id: suggestion.id,
              label: suggestion.label,
              icon: (
                <SlidersHorizontal className="size-4 shrink-0 text-primary" aria-hidden="true" />
              ),
              onSelect: () => {
                suggestion.onSelect();
                setQFocused(false);
              },
            })),
          },
        ]
      : []),
    ...(listingSuggestions && listingSuggestions.length > 0
      ? [
          {
            label: "Annonser",
            items: listingSuggestions.map((suggestion) => ({
              id: suggestion.id,
              label: suggestion.title,
              icon: (
                <SearchIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              ),
              kaupetCode: suggestion.kaupet_code,
              onSelect: () => {
                setQFocused(false);
              },
            })),
          },
        ]
      : []),
  ];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        searchInputRef.current?.blur();
        setQFocused(false);
        onSubmitQ();
      }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm transition-shadow focus-within:shadow-md focus-within:ring-2 focus-within:ring-ring hover:shadow-md">
        <div className="relative flex min-w-0 flex-1 items-center rounded-full px-4 py-1.5">
          <Input
            ref={searchInputRef}
            value={queryDisplay}
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
            id={ANNONSER_SEARCH_INPUT_ID}
            className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:outline-none"
            aria-autocomplete="list"
            aria-label="Søk i annonser"
            aria-expanded={hasDropdown}
            aria-controls="annonser-search-suggestions"
            aria-haspopup="listbox"
          />
          {hasDropdown && (
            <SearchSuggestionList
              groups={suggestionGroups}
              variant="dropdown"
              firstSuggestionRef={firstSuggestionRef}
              id="annonser-search-suggestions"
            />
          )}
        </div>

        {showQMode && (
          <div className="shrink-0">
            <Select value={qMode} onValueChange={(value: "all" | "any") => onQModeChange(value)}>
              <SelectTrigger aria-label="Søkeord" className="h-9 w-auto border-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle ordene</SelectItem>
                <SelectItem value="any">Minst ett ord</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {onOpenRules && (
          <Button
            type="button"
            size="icon"
            variant={rulesActive ? "default" : "ghost"}
            className={`size-12 shrink-0 rounded-full border ${
              rulesActive ? "border-primary" : "border-border"
            }`}
            onClick={onOpenRules}
            aria-label={rulesActive ? "Søkeregler, egne regler aktive" : "Søkeregler"}
          >
            <Waypoints className="size-4" aria-hidden />
          </Button>
        )}

        <Button
          type="submit"
          size="sm"
          className="size-12 shrink-0 rounded-full p-0 sm:h-10 sm:w-auto sm:px-5"
          aria-label="Søk"
        >
          <SearchIcon className="size-4" /> <span className="hidden sm:inline">Søk</span>
        </Button>
      </div>

      {showSearchBuilder && (
        <Collapsible defaultOpen={moreCount > 0} className="px-4">
          <CollapsibleTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="group gap-1 px-0 text-primary"
            >
              Legg til flere søkeregler{moreCount > 0 ? ` (${moreCount})` : ""}
              <ChevronDown
                className="size-4 transition-transform group-data-[state=open]:rotate-180"
                aria-hidden
              />
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-1 space-y-3 px-4 py-3">
            {!showQMode && (
              <div className="flex items-center justify-between gap-2">
                <Label className="text-sm font-medium">Ordene i søkefeltet</Label>
                <ModeToggle
                  value={qMode}
                  onChange={onQModeChange}
                  labels={["Alle ordene", "Minst ett ord"]}
                />
              </div>
            )}
            <SearchRuleFields
              q={q}
              qMode={qMode}
              extraGroups={extraGroups ?? []}
              onQChange={onQChange}
              onExtraGroupsChange={onExtraGroupsChange!}
              onSubmit={onSubmitQ}
            />
          </CollapsibleContent>
        </Collapsible>
      )}
    </form>
  );
}
