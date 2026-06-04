import { useState } from "react";
import { ChevronDown, MapPin, Search as SearchIcon, SlidersHorizontal, X } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";

export type Category = { id: string; slug: string; name_nb: string };
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
  categorySlug: string;
  onCategoryChange: (slug: string) => void;
  categories: Category[];
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
};

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
  categorySlug,
  onCategoryChange,
  categories,
  sort,
  onSortChange,
}: Props) {
  const [locOpen, setLocOpen] = useState(false);
  const [radiusOpen, setRadiusOpen] = useState(false);
  const [catOpen, setCatOpen] = useState(false);
  const [sortOpen, setSortOpen] = useState(false);

  const hasLocation = location.lat != null && location.lng != null;
  const currentCat = categories.find((c) => c.slug === categorySlug);
  const sortLabel = SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Nyeste først";

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
        <Popover open={catOpen} onOpenChange={setCatOpen}>
          <PopoverTrigger asChild>
            <BarButton active={!!currentCat}>
              <span className="truncate">{currentCat?.name_nb ?? "Alle kategorier"}</span>
              <ChevronDown className="size-4 opacity-60" />
            </BarButton>
          </PopoverTrigger>
          <PopoverContent align="start" className="max-h-[320px] w-[240px] overflow-y-auto p-1">
            <PopoverOption
              active={!categorySlug}
              onClick={() => {
                onCategoryChange("");
                setCatOpen(false);
              }}
            >
              Alle kategorier
            </PopoverOption>
            {categories.map((c) => (
              <PopoverOption
                key={c.id}
                active={categorySlug === c.slug}
                onClick={() => {
                  onCategoryChange(c.slug);
                  setCatOpen(false);
                }}
              >
                {c.name_nb}
              </PopoverOption>
            ))}
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
  const {
    q,
    onQChange,
    onSubmitQ,
    location,
    onLocationChange,
    categorySlug,
    onCategoryChange,
    categories,
    sort,
    onSortChange,
  } = props;
  const hasLocation = location.lat != null && location.lng != null;

  const summary =
    [q || null, location.label || null, categories.find((c) => c.slug === categorySlug)?.name_nb || null]
      .filter(Boolean)
      .join(" · ") || "Hva leter du etter?";

  return (
    <div className="md:hidden">
      <Sheet open={open} onOpenChange={setOpen}>
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
        <SheetContent side="bottom" className="h-[90vh] overflow-y-auto p-4">
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
                <LocationPicker value={location} onChange={onLocationChange} />
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
              <div className="mt-1 grid max-h-[200px] grid-cols-1 gap-1 overflow-y-auto rounded-md border border-border p-1">
                <PopoverOption active={!categorySlug} onClick={() => onCategoryChange("")}>
                  Alle kategorier
                </PopoverOption>
                {categories.map((c) => (
                  <PopoverOption
                    key={c.id}
                    active={categorySlug === c.slug}
                    onClick={() => onCategoryChange(c.slug)}
                  >
                    {c.name_nb}
                  </PopoverOption>
                ))}
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
      className={`flex max-w-[220px] items-center gap-2 rounded-full px-4 py-2 text-sm transition hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50 ${
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
