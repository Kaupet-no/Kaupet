import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  FolderOpen,
  MapPin,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { ModeToggle } from "@/components/mode-toggle";
import {
  buildTree,
  categoryLabel,
  findCategorySuggestion,
  selectAllForParent,
  type Category,
} from "@/lib/categories";
import { describeTermGroup } from "@/lib/term-groups";

export type { Category };

type Props = {
  q: string;
  onQChange: (v: string) => void;
  onSubmitQ: () => void;
  location: LocationValue;
  onLocationChange: (v: LocationValue) => void;
  selectedSlugs: string[];
  onSelectedChange: (slugs: string[]) => void;
  categories: Category[];
  /** Hide the category control — used when the advanced search panel (which
   * has its own, more capable category picker) is open, to avoid showing
   * two different category UIs at once. */
  hideCategory?: boolean;
  hideLocation?: boolean;
  qMode: "all" | "any";
  onQModeChange: (v: "all" | "any") => void;
  /** Show the "Alle ord"/"Minst ett"-toggle for the "Hva" field — only
   * relevant once the advanced search panel is open, since that's where the
   * extra search lines that make the distinction matter live. */
  showQMode?: boolean;
};

export function SearchBar({
  q,
  onQChange,
  onSubmitQ,
  location,
  onLocationChange,
  selectedSlugs,
  onSelectedChange,
  categories,
  hideCategory = false,
  hideLocation = false,
  qMode,
  onQModeChange,
  showQMode = false,
}: Props) {
  const [locOpen, setLocOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const [qFocused, setQFocused] = useState(false);
  const suggestionRef = useRef<HTMLButtonElement>(null);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const hasLocation = location.lat != null && location.lng != null;
  const label = categoryLabel(selectedSlugs, tree);
  const hasCategory = selectedSlugs.length > 0;

  const drillParent = drillParentId ? (tree.byId.get(drillParentId) ?? null) : null;
  const drillKids = drillParent ? (tree.childrenByParent.get(drillParent.id) ?? []) : [];

  // Suggest a matching category while the user types in "Hva", so people who
  // type a category name (e.g. "sykkel") discover that browsing by category
  // is also possible from the same field, without needing a separate UI.
  const qSuggestion = useMemo(() => findCategorySuggestion(categories, q), [q, categories]);

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitQ();
      }}
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm transition-shadow focus-within:shadow-md hover:shadow-md">
        <div className="relative flex min-w-0 flex-1 flex-nowrap items-center gap-1 overflow-x-auto [scrollbar-width:none] after:pointer-events-none after:absolute after:right-0 after:top-0 after:h-full after:w-8 after:bg-gradient-to-l after:from-card after:to-transparent [&::-webkit-scrollbar]:hidden">
          {/* Hva */}
          <div className="relative flex min-w-[120px] flex-1 items-center gap-2 rounded-full px-4 py-1.5">
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => onQChange(e.target.value)}
              onFocus={() => setQFocused(true)}
              onBlur={() => setQFocused(false)}
              onKeyDown={(e) => {
                if ((e.key === "ArrowDown" || e.key === "Tab") && qSuggestion && !e.shiftKey) {
                  if (suggestionRef.current) {
                    e.preventDefault();
                    suggestionRef.current.focus();
                  }
                }
              }}
              placeholder="Hva leter du etter?"
              className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 focus-visible:outline-none"
              aria-autocomplete="list"
              aria-expanded={!!(qFocused && qSuggestion)}
              aria-haspopup="listbox"
            />
            {qFocused && qSuggestion && (
              <div
                role="listbox"
                aria-label="Kategorisøk"
                className="absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-md"
              >
                <button
                  ref={suggestionRef}
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
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span>
                    Gå til kategori: <span className="font-medium">{qSuggestion.name_nb}</span>
                  </span>
                </button>
              </div>
            )}
          </div>

          {showQMode && (
            <div className="shrink-0">
              <ModeToggle
                value={qMode}
                onChange={onQModeChange}
                labels={["Alle ord", "Minst ett"]}
              />
            </div>
          )}

          {!hideLocation && (
            <>
              <Divider />

              {/* Hvor */}
              <Popover open={locOpen} onOpenChange={setLocOpen}>
                <PopoverTrigger asChild>
                  <BarButton active={hasLocation}>
                    <MapPin className="size-4" />
                    <span className="truncate">{location.label || "Hvor som helst"}</span>
                    {hasLocation && (
                      <span
                        role="button"
                        tabIndex={0}
                        className="ml-1 rounded-full p-0.5 hover:bg-muted"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLocationChange({
                            lat: null,
                            lng: null,
                            radius: location.radius,
                            label: "",
                          });
                        }}
                        aria-label="Fjern lokasjon"
                      >
                        <X className="size-3.5" />
                      </span>
                    )}
                  </BarButton>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-2">
                  <LocationPicker
                    value={location}
                    onChange={onLocationChange}
                    onDone={() => setLocOpen(false)}
                  />
                </PopoverContent>
              </Popover>

              <Divider />

              {/* Radius */}
              <Popover open={radiusOpen} onOpenChange={setRadiusOpen}>
                <PopoverTrigger asChild>
                  <BarButton disabled={!hasLocation} active={hasLocation}>
                    <SlidersHorizontal className="size-4" />
                    <span>{hasLocation ? `${location.radius} km` : "Radius"}</span>
                  </BarButton>
                </PopoverTrigger>
                <PopoverContent align="start" className="p-1">
                  <RadiusPicker
                    value={location.radius}
                    onChange={(r) => onLocationChange({ ...location, radius: r })}
                  />
                </PopoverContent>
              </Popover>
            </>
          )}

          {!hideCategory && (
            <>
              <Divider />

              {/* Kategori */}
              <Popover
                open={catOpen}
                onOpenChange={(o) => {
                  setCatOpen(o);
                  if (!o) setDrillParentId(null);
                }}
              >
                <PopoverTrigger asChild>
                  <BarButton active={hasCategory}>
                    <span className="truncate">{label}</span>
                    <ChevronDown className="size-4 opacity-60" />
                  </BarButton>
                </PopoverTrigger>
                <PopoverContent
                  align="start"
                  className="max-h-[360px] w-[min(280px,calc(100vw-2rem))] overflow-y-auto p-1"
                >
                  {drillParent ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDrillParentId(null)}
                        className="flex w-full items-center gap-1 rounded px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
                      >
                        <ChevronLeft className="size-3.5" /> Tilbake til hovedkategorier
                      </button>
                      <PopoverOption
                        active={
                          selectedSlugs.length === 1 + drillKids.length &&
                          selectedSlugs.includes(drillParent.slug) &&
                          drillKids.every((k) => selectedSlugs.includes(k.slug))
                        }
                        onClick={() => {
                          onSelectedChange(selectAllForParent(drillParent, tree));
                          setCatOpen(false);
                          setDrillParentId(null);
                        }}
                      >
                        <span className="font-medium">Alt i {drillParent.name_nb}</span>
                      </PopoverOption>
                      {drillKids.length === 0 ? (
                        <p className="px-3 py-2 text-xs text-muted-foreground">
                          Ingen underkategorier
                        </p>
                      ) : (
                        drillKids.map((k) => (
                          <PopoverOption
                            key={k.id}
                            active={selectedSlugs.length === 1 && selectedSlugs[0] === k.slug}
                            onClick={() => {
                              onSelectedChange([k.slug]);
                              setCatOpen(false);
                              setDrillParentId(null);
                            }}
                          >
                            {k.name_nb}
                          </PopoverOption>
                        ))
                      )}
                    </>
                  ) : (
                    <>
                      <PopoverOption
                        active={!hasCategory}
                        onClick={() => {
                          onSelectedChange([]);
                          setCatOpen(false);
                        }}
                      >
                        Alle kategorier
                      </PopoverOption>
                      {tree.roots.map((c) => (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => setDrillParentId(c.id)}
                          className="flex w-full items-center justify-between gap-2 rounded px-3 py-2 text-left text-sm hover:bg-muted"
                        >
                          <span className="truncate">{c.name_nb}</span>
                          <ChevronRight className="size-4 shrink-0 opacity-60" />
                        </button>
                      ))}
                    </>
                  )}
                </PopoverContent>
              </Popover>
            </>
          )}
        </div>

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

function Divider() {
  return <span aria-hidden className="h-6 w-px shrink-0 bg-border/70" />;
}

function BarButton({
  children,
  active,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      disabled={disabled}
      {...rest}
      className={`flex max-w-[140px] shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 sm:max-w-[260px] ${
        active ? "font-medium text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PopoverOption({
  children,
  active,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { active?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted ${
        active ? "bg-muted font-medium" : ""
      }`}
    >
      {children}
    </button>
  );
}
