import { useState } from "react";
import {
  ArrowRight,
  ChevronLeft,
  LayoutGrid,
  MapPin,
  MoreHorizontal,
  SlidersHorizontal,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { CONDITIONS } from "@/components/advanced-search-value";
import { SORT_OPTIONS, type SortValue, type Category } from "@/lib/categories";
import { getCategoryIcon } from "@/lib/category-icons";
import { hapticImpact } from "@/lib/haptics";

type Props = {
  sort: SortValue;
  onSortChange: (v: SortValue) => void;
  categories: Category[];
  selectedCategories: string[];
  onCategoriesChange: (slugs: string[]) => void;
  min?: number;
  max?: number;
  includeFree: boolean;
  onPriceChange: (min: number | undefined, max: number | undefined, includeFree: boolean) => void;
  conditions: string[];
  onConditionsChange: (c: string[]) => void;
  location: LocationValue;
  onLocationChange: (v: LocationValue) => void;
  resultCount: number;
  onOpenAdvanced: () => void;
  advancedFilterCount?: number;
};

type SheetId = "sort" | "category" | "price" | "condition" | "location" | null;

export function NativeFilterChips({
  sort,
  onSortChange,
  categories,
  selectedCategories,
  onCategoriesChange,
  min,
  max,
  includeFree,
  onPriceChange,
  conditions,
  onConditionsChange,
  location,
  onLocationChange,
  resultCount,
  onOpenAdvanced,
  advancedFilterCount = 0,
}: Props) {
  const [openSheet, setOpenSheet] = useState<SheetId>(null);

  const open = (id: SheetId) => {
    void hapticImpact("light");
    setOpenSheet(id);
  };

  const close = () => setOpenSheet(null);

  // Labels for active filters
  const sortLabel = SORT_OPTIONS.find((s) => s.value === sort)?.label ?? "Nyeste";
  const sortActive = sort !== "new";
  const catActive = selectedCategories.length > 0;
  const catLabel = catActive
    ? selectedCategories.length === 1
      ? (categories.find((c) => c.slug === selectedCategories[0])?.name_nb ?? "Kategori")
      : `${selectedCategories.length} kat.`
    : "Kategori";
  const priceActive = min != null || max != null || !includeFree;
  const priceLabel = priceActive
    ? min != null && max != null
      ? `${min}–${max} kr`
      : min != null
        ? `Fra ${min} kr`
        : max != null
          ? `Til ${max} kr`
          : "Pris"
    : "Pris";
  const condActive = conditions.length > 0;
  const condLabel = condActive ? `${conditions.length} tilstand` : "Tilstand";
  const locActive = location.lat != null;
  const locLabel = locActive ? (location.label ? location.label.split(",")[0] : "Sted") : "Sted";

  const resultBtn = (
    <Button
      size="sm"
      className="mt-4 w-full"
      onClick={() => {
        void hapticImpact("medium");
        close();
      }}
    >
      Vis {resultCount} annonse{resultCount === 1 ? "" : "r"}
    </Button>
  );

  return (
    <>
      <div className="flex gap-2 overflow-x-auto pb-1 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip
          label={sortLabel}
          active={sortActive}
          icon={<SlidersHorizontal className="size-3.5" />}
          onPress={() => open("sort")}
        />
        <Chip
          label={catLabel}
          active={catActive}
          icon={<LayoutGrid className="size-3.5" />}
          onPress={() => open("category")}
        />
        <Chip
          label={priceLabel}
          active={priceActive}
          icon={<span className="text-[11px] font-bold">kr</span>}
          onPress={() => open("price")}
        />
        <Chip
          label={condLabel}
          active={condActive}
          icon={<span className="text-[11px]">✦</span>}
          onPress={() => open("condition")}
        />
        <Chip
          label={locLabel}
          active={locActive}
          icon={<MapPin className="size-3.5" />}
          onPress={() => open("location")}
        />
        <Chip
          label="Mer"
          active={advancedFilterCount > 0}
          icon={<MoreHorizontal className="size-3.5" />}
          onPress={() => {
            void hapticImpact("light");
            onOpenAdvanced();
          }}
          badge={advancedFilterCount > 0 ? advancedFilterCount : undefined}
        />
      </div>

      {/* Sort sheet */}
      <Sheet open={openSheet === "sort"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Sorter etter</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-2">
            {SORT_OPTIONS.map((s) => (
              <button
                key={s.value}
                type="button"
                onClick={() => {
                  void hapticImpact("light");
                  onSortChange(s.value);
                  close();
                }}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                  sort === s.value
                    ? "border-primary bg-primary/5 font-medium text-primary"
                    : "border-border bg-card"
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </SheetContent>
      </Sheet>

      {/* Category sheet */}
      <CategorySheet
        open={openSheet === "category"}
        onClose={close}
        categories={categories}
        selected={selectedCategories}
        onSelect={onCategoriesChange}
        resultCount={resultCount}
      />

      {/* Price sheet */}
      <Sheet open={openSheet === "price"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <PriceSheetContent
            min={min}
            max={max}
            includeFree={includeFree}
            onApply={(mn, mx, free) => {
              onPriceChange(mn, mx, free);
              close();
            }}
            resultBtn={resultBtn}
          />
        </SheetContent>
      </Sheet>

      {/* Condition sheet */}
      <Sheet open={openSheet === "condition"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Tilstand</SheetTitle>
          </SheetHeader>
          <div className="mt-4 flex flex-col gap-3">
            {CONDITIONS.map((c) => (
              <label key={c.value} className="flex cursor-pointer items-center gap-3 py-1">
                <Checkbox
                  checked={conditions.includes(c.value)}
                  onCheckedChange={(checked) => {
                    void hapticImpact("light");
                    onConditionsChange(
                      checked ? [...conditions, c.value] : conditions.filter((v) => v !== c.value),
                    );
                  }}
                  id={`cond-${c.value}`}
                />
                <Label htmlFor={`cond-${c.value}`} className="cursor-pointer text-base">
                  {c.label}
                </Label>
              </label>
            ))}
          </div>
          {resultBtn}
        </SheetContent>
      </Sheet>

      {/* Location sheet */}
      <Sheet open={openSheet === "location"} onOpenChange={(o) => !o && close()}>
        <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
          <SheetHeader>
            <SheetTitle>Sted og radius</SheetTitle>
          </SheetHeader>
          <div className="mt-4 space-y-4">
            <LocationPicker
              value={location}
              onChange={onLocationChange}
              onDone={close}
              autoFocus={false}
            />
            {locActive && (
              <RadiusPicker
                value={location.radius}
                onChange={(r) => onLocationChange({ ...location, radius: r })}
              />
            )}
          </div>
          {resultBtn}
        </SheetContent>
      </Sheet>
    </>
  );
}

function Chip({
  label,
  active,
  icon,
  onPress,
  badge,
}: {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  onPress: () => void;
  badge?: number;
}) {
  return (
    <button
      type="button"
      onClick={onPress}
      className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition active:scale-[0.96] ${
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-foreground"
      }`}
    >
      {icon}
      <span className="max-w-[120px] truncate">{label}</span>
      {badge != null && badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function CategorySheet({
  open,
  onClose,
  categories,
  selected,
  onSelect,
  resultCount,
}: {
  open: boolean;
  onClose: () => void;
  categories: Category[];
  selected: string[];
  onSelect: (slugs: string[]) => void;
  resultCount: number;
}) {
  const [activeParent, setActiveParent] = useState<Category | null>(null);

  const rootCategories = categories.filter((c) => c.parent_id === null);
  const childrenOf = (id: string) => categories.filter((c) => c.parent_id === id);

  const toggleSlug = (slug: string) => {
    void hapticImpact("light");
    onSelect(selected.includes(slug) ? selected.filter((s) => s !== slug) : [...selected, slug]);
  };

  const selectAll = (parent: Category) => {
    void hapticImpact("medium");
    const subs = childrenOf(parent.id).map((c) => c.slug);
    const allSlugs = [parent.slug, ...subs];
    // If all already selected — deselect all
    const allSelected = allSlugs.every((s) => selected.includes(s));
    onSelect(
      allSelected
        ? selected.filter((s) => !allSlugs.includes(s))
        : [...new Set([...selected, ...allSlugs])],
    );
    onClose();
  };

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          onClose();
          setActiveParent(null);
        }
      }}
    >
      <SheetContent side="bottom" className="max-h-[80vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader className="text-left">
          <SheetTitle className="flex items-center gap-3">
            {activeParent ? activeParent.name_nb : "Kategori"}
            {activeParent && (
              <button
                type="button"
                onClick={() => setActiveParent(null)}
                className="flex shrink-0 items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium transition hover:border-primary hover:text-primary"
              >
                <ChevronLeft className="size-3.5" />
                Tilbake
              </button>
            )}
          </SheetTitle>
        </SheetHeader>

        <div className="mt-4 flex flex-col gap-2">
          {!activeParent ? (
            rootCategories.map((cat) => {
              const Icon = getCategoryIcon(undefined);
              const hasSubs = childrenOf(cat.id).length > 0;
              const isActive = selected.includes(cat.slug);
              return (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => (hasSubs ? setActiveParent(cat) : toggleSlug(cat.slug))}
                  className={`group flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                    isActive ? "border-primary bg-primary/5" : "border-border bg-card"
                  }`}
                >
                  <span
                    className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
                  >
                    <Icon className="size-5" />
                  </span>
                  <span className={`truncate font-medium ${isActive ? "text-primary" : ""}`}>
                    {cat.name_nb}
                  </span>
                  {hasSubs && (
                    <ArrowRight className="ml-auto size-4 shrink-0 text-muted-foreground" />
                  )}
                </button>
              );
            })
          ) : (
            <>
              <button
                type="button"
                onClick={() => selectAll(activeParent)}
                className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left font-medium transition active:scale-[0.98]"
              >
                Alt i {activeParent.name_nb}
              </button>
              {childrenOf(activeParent.id).map((sub) => {
                const Icon = getCategoryIcon(undefined);
                const isActive = selected.includes(sub.slug);
                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => toggleSlug(sub.slug)}
                    className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-left transition active:scale-[0.98] ${
                      isActive ? "border-primary bg-primary/5" : "border-border bg-card"
                    }`}
                  >
                    <span
                      className={`flex size-9 shrink-0 items-center justify-center rounded-lg ${isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}
                    >
                      <Icon className="size-5" />
                    </span>
                    <span className={`truncate font-medium ${isActive ? "text-primary" : ""}`}>
                      {sub.name_nb}
                    </span>
                  </button>
                );
              })}
            </>
          )}
        </div>

        <Button
          size="sm"
          className="mt-4 w-full"
          onClick={() => {
            void hapticImpact("medium");
            onClose();
            setActiveParent(null);
          }}
        >
          Vis {resultCount} annonse{resultCount === 1 ? "" : "r"}
        </Button>
      </SheetContent>
    </Sheet>
  );
}

function PriceSheetContent({
  min,
  max,
  includeFree,
  onApply,
  resultBtn,
}: {
  min?: number;
  max?: number;
  includeFree: boolean;
  onApply: (min: number | undefined, max: number | undefined, includeFree: boolean) => void;
  resultBtn: React.ReactNode;
}) {
  const [minDraft, setMinDraft] = useState(min != null ? String(min) : "");
  const [maxDraft, setMaxDraft] = useState(max != null ? String(max) : "");
  const [freeDraft, setFreeDraft] = useState(includeFree);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Pris</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <div className="flex gap-3">
          <div className="flex-1 space-y-1">
            <Label htmlFor="price-min" className="text-sm text-muted-foreground">
              Min (kr)
            </Label>
            <Input
              id="price-min"
              type="number"
              inputMode="numeric"
              value={minDraft}
              onChange={(e) => setMinDraft(e.target.value)}
              placeholder="0"
              className="h-11"
            />
          </div>
          <div className="flex-1 space-y-1">
            <Label htmlFor="price-max" className="text-sm text-muted-foreground">
              Maks (kr)
            </Label>
            <Input
              id="price-max"
              type="number"
              inputMode="numeric"
              value={maxDraft}
              onChange={(e) => setMaxDraft(e.target.value)}
              placeholder="–"
              className="h-11"
            />
          </div>
        </div>
        <label className="flex cursor-pointer items-center gap-3">
          <Checkbox
            checked={freeDraft}
            onCheckedChange={(checked) => {
              void hapticImpact("light");
              setFreeDraft(!!checked);
            }}
            id="include-free"
          />
          <Label htmlFor="include-free" className="cursor-pointer text-base">
            Inkluder gratis-annonser
          </Label>
        </label>
      </div>
      <Button
        size="sm"
        className="mt-4 w-full"
        onClick={() => {
          void hapticImpact("medium");
          const mn = minDraft ? parseInt(minDraft) : undefined;
          const mx = maxDraft ? parseInt(maxDraft) : undefined;
          onApply(mn, mx, freeDraft);
        }}
      >
        Bruk prisfilter
      </Button>
    </>
  );
}
