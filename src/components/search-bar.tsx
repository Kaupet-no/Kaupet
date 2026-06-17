import { useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Search as SearchIcon,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";

export type Category = { id: string; slug: string; name_nb: string; parent_id: string | null };
export type SortValue = "new" | "price_asc" | "price_desc";

const SORT_OPTIONS: Array<{ value: SortValue; label: string }> = [
  { value: "new", label: "Nyeste først" },
  { value: "price_asc", label: "Pris: lav → høy" },
  { value: "price_desc", label: "Pris: høy → lav" },
];

type Props = {
  q: string;
  onQChange: (v: string) => void;
  onSubmitQ: () => void;
  location: LocationValue;
  onLocationChange: (v: LocationValue) => void;
  selectedSlugs: string[];
  onSelectedChange: (slugs: string[]) => void;
  categories: Category[];
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
};

type CatTree = {
  roots: Category[];
  childrenByParent: Map<string, Category[]>;
  bySlug: Map<string, Category>;
  byId: Map<string, Category>;
};

function buildTree(categories: Category[]): CatTree {
  const roots: Category[] = [];
  const childrenByParent = new Map<string, Category[]>();
  const bySlug = new Map<string, Category>();
  const byId = new Map<string, Category>();
  for (const c of categories) {
    bySlug.set(c.slug, c);
    byId.set(c.id, c);
    if (c.parent_id == null) roots.push(c);
    else {
      const arr = childrenByParent.get(c.parent_id) ?? [];
      arr.push(c);
      childrenByParent.set(c.parent_id, arr);
    }
  }
  return { roots, childrenByParent, bySlug, byId };
}

function categoryLabel(selectedSlugs: string[], tree: CatTree): string {
  if (selectedSlugs.length === 0) return "Alle kategorier";
  const set = new Set(selectedSlugs);

  // "Alle i parent": parent slug + all its children slugs present
  for (const root of tree.roots) {
    const kids = tree.childrenByParent.get(root.id) ?? [];
    if (kids.length === 0) continue;
    const allChildrenSlugs = kids.map((k) => k.slug);
    const hasAll =
      set.has(root.slug) &&
      allChildrenSlugs.every((s) => set.has(s)) &&
      set.size === 1 + allChildrenSlugs.length;
    if (hasAll) return root.name_nb;
  }

  if (selectedSlugs.length === 1) {
    const c = tree.bySlug.get(selectedSlugs[0]);
    if (!c) return "1 kategori";
    if (c.parent_id) {
      const parent = tree.byId.get(c.parent_id);
      return parent ? `${parent.name_nb} › ${c.name_nb}` : c.name_nb;
    }
    return c.name_nb;
  }
  return `${selectedSlugs.length} kategorier`;
}

function selectAllForParent(parent: Category, tree: CatTree): string[] {
  const kids = tree.childrenByParent.get(parent.id) ?? [];
  return [parent.slug, ...kids.map((k) => k.slug)];
}

export function SearchBar(props: Props) {
  return (
    <>
      <DesktopBar {...props} />
      <MobileBar {...props} />
    </>
  );
}

function DesktopBar({
  q,
  onQChange,
  onSubmitQ,
  location,
  onLocationChange,
  selectedSlugs,
  onSelectedChange,
  categories,
  sort,
  onSortChange,
}: Props) {
  const [locOpen, setLocOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const [sortOpen, setSortOpen] = useState(false);

  const tree = useMemo(() => buildTree(categories), [categories]);
  const hasLocation = location.lat != null && location.lng != null;
  const label = categoryLabel(selectedSlugs, tree);
  const sortLabel = SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Nyeste først";
  const hasCategory = selectedSlugs.length > 0;

  const drillParent = drillParentId ? (tree.byId.get(drillParentId) ?? null) : null;
  const drillKids = drillParent ? (tree.childrenByParent.get(drillParent.id) ?? []) : [];

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmitQ();
      }}
      className="hidden md:block"
    >
      <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1 shadow-sm transition-shadow focus-within:shadow-md hover:shadow-md">
        {/* Hva */}
        <div className="flex flex-1 items-center gap-2 rounded-full px-4 py-1.5">
          <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => onQChange(e.target.value)}
            placeholder="Hva leter du etter?"
            className="h-8 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0"
          />
        </div>

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
                    onLocationChange({ lat: null, lng: null, radius: location.radius, label: "" });
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
          <PopoverContent align="start" className="max-h-[360px] w-[280px] overflow-y-auto p-1">
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
                  <p className="px-3 py-2 text-xs text-muted-foreground">Ingen underkategorier</p>
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

        <Divider />

        {/* Sortering */}
        <Popover open={sortOpen} onOpenChange={setSortOpen}>
          <PopoverTrigger asChild>
            <BarButton>
              <span className="truncate">{sortLabel}</span>
              <ChevronDown className="size-4 opacity-60" />
            </BarButton>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-[200px] p-1">
            {SORT_OPTIONS.map((s) => (
              <PopoverOption
                key={s.value}
                active={sort === s.value}
                onClick={() => {
                  onSortChange(s.value);
                  setSortOpen(false);
                }}
              >
                {s.label}
              </PopoverOption>
            ))}
          </PopoverContent>
        </Popover>

        <Button type="submit" size="sm" className="ml-1 h-9 rounded-full px-5">
          <SearchIcon className="size-4" /> Søk
        </Button>
      </div>
    </form>
  );
}

function MobileBar(props: Props) {
  const [open, setOpen] = useState(false);
  const [drillParentId, setDrillParentId] = useState<string | null>(null);
  const {
    q,
    onQChange,
    onSubmitQ,
    location,
    onLocationChange,
    selectedSlugs,
    onSelectedChange,
    categories,
    sort,
    onSortChange,
  } = props;
  const tree = useMemo(() => buildTree(categories), [categories]);
  const hasLocation = location.lat != null && location.lng != null;
  const label = categoryLabel(selectedSlugs, tree);
  const drillParent = drillParentId ? (tree.byId.get(drillParentId) ?? null) : null;
  const drillKids = drillParent ? (tree.childrenByParent.get(drillParent.id) ?? []) : [];

  const summary =
    [q || null, location.label || null, selectedSlugs.length > 0 ? label : null]
      .filter(Boolean)
      .join(" · ") || "Hva leter du etter?";

  return (
    <div className="md:hidden">
      <Sheet
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setDrillParentId(null);
        }}
      >
        <SheetTrigger asChild>
          <button
            type="button"
            className="flex w-full items-center gap-3 rounded-full border border-border bg-card px-4 py-3 text-left shadow-sm"
          >
            <SearchIcon className="size-4 shrink-0 text-muted-foreground" />
            <span className="line-clamp-1 flex-1 text-sm text-foreground">{summary}</span>
            <SlidersHorizontal className="size-4 text-muted-foreground" />
          </button>
        </SheetTrigger>
        <SheetContent
          side="bottom"
          className="h-[90dvh] overflow-y-auto p-4"
          tabIndex={-1}
          onOpenAutoFocus={(e) => {
            // Radix focuses the first focusable element (the "Hva" input)
            // on mount by default, which pops the keyboard while the sheet
            // is still animating in. Keep focus on the sheet itself instead;
            // the keyboard only opens once the user taps a field.
            e.preventDefault();
            (e.target as HTMLElement)?.focus();
          }}
        >
          <SheetHeader>
            <SheetTitle>Søk</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-5">
            <div>
              <label className="text-xs font-medium text-muted-foreground">Hva</label>
              <div className="relative mt-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => onQChange(e.target.value)}
                  placeholder="Hva leter du etter?"
                  className="pl-9"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Hvor</label>
              <div className="mt-1 rounded-md border border-border p-1">
                <LocationPicker value={location} onChange={onLocationChange} autoFocus={false} />
              </div>
            </div>

            {hasLocation && (
              <div>
                <label className="text-xs font-medium text-muted-foreground">Radius</label>
                <div className="mt-1 rounded-md border border-border p-1">
                  <RadiusPicker
                    value={location.radius}
                    onChange={(r) => onLocationChange({ ...location, radius: r })}
                  />
                </div>
              </div>
            )}

            <div>
              <label className="text-xs font-medium text-muted-foreground">Kategori</label>
              <div className="mt-1 grid max-h-[260px] grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-1">
                {drillParent ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setDrillParentId(null)}
                      className="flex w-full items-center gap-1 rounded px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted"
                    >
                      <ChevronLeft className="size-3.5" /> Tilbake
                    </button>
                    <PopoverOption
                      active={
                        selectedSlugs.length === 1 + drillKids.length &&
                        selectedSlugs.includes(drillParent.slug) &&
                        drillKids.every((k) => selectedSlugs.includes(k.slug))
                      }
                      onClick={() => {
                        onSelectedChange(selectAllForParent(drillParent, tree));
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
                      active={selectedSlugs.length === 0}
                      onClick={() => onSelectedChange([])}
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
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-muted-foreground">Sortering</label>
              <div className="mt-1 grid grid-cols-1 gap-1 rounded-md border border-border p-1">
                {SORT_OPTIONS.map((s) => (
                  <PopoverOption
                    key={s.value}
                    active={sort === s.value}
                    onClick={() => onSortChange(s.value)}
                  >
                    {s.label}
                  </PopoverOption>
                ))}
              </div>
            </div>

            <Button
              type="button"
              className="w-full rounded-full"
              onClick={() => {
                onSubmitQ();
                setOpen(false);
              }}
            >
              <SearchIcon className="size-4" /> Vis annonser
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
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
      className={`flex max-w-[260px] items-center gap-2 rounded-full px-4 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${
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
