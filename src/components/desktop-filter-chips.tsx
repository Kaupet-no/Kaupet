import { useState } from "react";
import { ChevronDown, LayoutGrid, MoreHorizontal, SlidersHorizontal } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { CategoryPicker } from "@/components/advanced-search-sheet";
import { ModeToggle } from "@/components/search-term-mode-toggle";
import { TermGroupEditor } from "@/components/term-group-editor";
import { AttributeFilterPanel } from "@/components/attribute-filter-panel";
import { CONDITIONS, type AdvancedSearchValue } from "@/components/advanced-search-value";
import { SORT_OPTIONS, type SortValue, type Category } from "@/lib/categories";
import type { TermGroup } from "@/lib/term-groups";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";
import {
  getSortChipState,
  getCategoryChipState,
  getPriceChipState,
  getConditionChipState,
} from "@/lib/filter-chip-labels";
import { usePriceDraft } from "@/hooks/use-price-draft";

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
  qMode: AdvancedSearchValue["qMode"];
  onQModeChange: (v: AdvancedSearchValue["qMode"]) => void;
  extraGroups: TermGroup[];
  onExtraGroupsChange: (groups: TermGroup[]) => void;
  /** Category-specific search parameters (empty when no category is selected,
   * or the intersection of common fields when several are selected). */
  attrFilters?: CategoryFilter[];
  attrValues?: Record<string, AttributeFilterValue>;
  onAttrValuesChange?: (key: string, value: AttributeFilterValue | undefined) => void;
};

/**
 * Desktop equivalent of NativeFilterChips: a row of filter pills, each
 * showing its own active state, instead of a separate collapsible
 * "advanced search" section that duplicated what ActiveFilters showed below.
 */
export function DesktopFilterChips({
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
  qMode,
  onQModeChange,
  extraGroups,
  onExtraGroupsChange,
  attrFilters = [],
  attrValues = {},
  onAttrValuesChange,
}: Props) {
  const [openId, setOpenId] = useState<
    "sort" | "category" | "price" | "condition" | "attrs" | "more" | null
  >(null);

  const attrValueCount = Object.keys(attrValues).length;

  const { label: sortLabel, active: sortActive } = getSortChipState(sort);
  const { label: catLabel, active: catActive } = getCategoryChipState(
    categories,
    selectedCategories,
  );
  const { label: priceLabel, active: priceActive } = getPriceChipState(min, max, includeFree);
  const { label: condLabel, active: condActive } = getConditionChipState(conditions);

  const moreCount = extraGroups.length + (qMode === "any" ? 1 : 0);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Popover open={openId === "sort"} onOpenChange={(o) => setOpenId(o ? "sort" : null)}>
        <PopoverTrigger asChild>
          <Chip
            label={sortLabel}
            active={sortActive}
            icon={<SlidersHorizontal className="size-3.5" />}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-56 p-1">
          {SORT_OPTIONS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => {
                onSortChange(s.value);
                setOpenId(null);
              }}
              className={`block w-full rounded px-3 py-2 text-left text-sm hover:bg-muted ${
                sort === s.value ? "bg-muted font-medium" : ""
              }`}
            >
              {s.label}
            </button>
          ))}
        </PopoverContent>
      </Popover>

      <Popover open={openId === "category"} onOpenChange={(o) => setOpenId(o ? "category" : null)}>
        <PopoverTrigger asChild>
          <Chip label={catLabel} active={catActive} icon={<LayoutGrid className="size-3.5" />} />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80 p-3">
          <CategoryPicker
            categories={categories}
            selected={selectedCategories}
            onChange={onCategoriesChange}
          />
        </PopoverContent>
      </Popover>

      <Popover open={openId === "price"} onOpenChange={(o) => setOpenId(o ? "price" : null)}>
        <PopoverTrigger asChild>
          <Chip
            label={priceLabel}
            active={priceActive}
            icon={<span className="text-[11px] font-bold">kr</span>}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-72 p-3">
          <PricePopoverContent
            min={min}
            max={max}
            includeFree={includeFree}
            onApply={(mn, mx, free) => {
              onPriceChange(mn, mx, free);
              setOpenId(null);
            }}
          />
        </PopoverContent>
      </Popover>

      <Popover
        open={openId === "condition"}
        onOpenChange={(o) => setOpenId(o ? "condition" : null)}
      >
        <PopoverTrigger asChild>
          <Chip
            label={condLabel}
            active={condActive}
            icon={<span className="text-[11px]">✦</span>}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64 p-2">
          <div className="flex flex-col gap-1">
            {CONDITIONS.map((c) => (
              <label
                key={c.value}
                className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted"
              >
                <Checkbox
                  checked={conditions.includes(c.value)}
                  onCheckedChange={(checked) =>
                    onConditionsChange(
                      checked ? [...conditions, c.value] : conditions.filter((v) => v !== c.value),
                    )
                  }
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        </PopoverContent>
      </Popover>

      {attrFilters.length > 0 && onAttrValuesChange && (
        <Popover open={openId === "attrs"} onOpenChange={(o) => setOpenId(o ? "attrs" : null)}>
          <PopoverTrigger asChild>
            <Chip
              label="Egenskaper"
              active={attrValueCount > 0}
              icon={<SlidersHorizontal className="size-3.5" />}
              badge={attrValueCount}
            />
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 space-y-3 p-3">
            <AttributeFilterPanel
              filters={attrFilters}
              values={attrValues}
              onChange={onAttrValuesChange}
            />
          </PopoverContent>
        </Popover>
      )}

      <Popover open={openId === "more"} onOpenChange={(o) => setOpenId(o ? "more" : null)}>
        <PopoverTrigger asChild>
          <Chip
            label="Flere valg"
            active={moreCount > 0}
            icon={<MoreHorizontal className="size-3.5" />}
            badge={moreCount}
          />
        </PopoverTrigger>
        <PopoverContent align="start" className="w-96 space-y-4 p-4">
          <div className="flex items-center justify-between gap-2">
            <Label className="text-sm font-medium">Søkeordmodus</Label>
            <ModeToggle value={qMode} onChange={onQModeChange} labels={["Alle ord", "Minst ett"]} />
          </div>
          <div className="space-y-2">
            <Label className="text-sm font-medium">Flere søkelinjer</Label>
            <TermGroupEditor groups={extraGroups} onChange={onExtraGroupsChange} />
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

function Chip({
  label,
  active,
  icon,
  badge,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active: boolean;
  icon: React.ReactNode;
  badge?: number;
}) {
  return (
    <button
      type="button"
      {...rest}
      className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition ${
        active
          ? "border-primary bg-primary font-medium text-primary-foreground"
          : "border-border bg-card text-foreground hover:bg-muted"
      }`}
    >
      {active && <span className="size-1.5 shrink-0 rounded-full bg-primary-foreground" />}
      {icon}
      <span className="max-w-[160px] truncate">{label}</span>
      <ChevronDown className="size-3.5 opacity-60" />
      {badge != null && badge > 0 && (
        <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
          {badge}
        </span>
      )}
    </button>
  );
}

function PricePopoverContent({
  min,
  max,
  includeFree,
  onApply,
}: {
  min?: number;
  max?: number;
  includeFree: boolean;
  onApply: (min: number | undefined, max: number | undefined, includeFree: boolean) => void;
}) {
  const { minDraft, setMinDraft, maxDraft, setMaxDraft, freeDraft, setFreeDraft, apply } =
    usePriceDraft(min, max, includeFree, onApply);

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          min={0}
          placeholder="Fra"
          value={minDraft}
          onChange={(e) => setMinDraft(e.target.value)}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          type="number"
          min={0}
          placeholder="Til"
          value={maxDraft}
          onChange={(e) => setMaxDraft(e.target.value)}
        />
      </div>
      <label className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground">
        <Checkbox checked={freeDraft} onCheckedChange={(c) => setFreeDraft(c === true)} />
        Inkluder gratis-annonser
      </label>
      <Button type="button" size="sm" className="w-full" onClick={apply}>
        Bruk prisfilter
      </Button>
    </div>
  );
}
