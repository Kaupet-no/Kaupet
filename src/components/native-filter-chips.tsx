import { MapPin, MoreHorizontal } from "lucide-react";
import type { LocationValue } from "@/components/location-filter";
import { hapticImpact } from "@/lib/haptics";
import { getPriceChipState, getConditionChipState } from "@/lib/filter-chip-labels";
import { FilterChip } from "@/components/filter-chip";
import type { NativeAdvancedSearchSection } from "@/components/native-advanced-search";

type Props = {
  min?: number;
  max?: number;
  includeFree: boolean;
  conditions: string[];
  location: LocationValue;
  onOpenAdvanced: (section: NativeAdvancedSearchSection) => void;
  advancedFilterCount?: number;
  /** Hides the "Tilstand" chip — no listing under Bil og MC has that attribute. */
  hideCondition?: boolean;
  /** Tab the "Mer" chip opens to — "attributes" (the panel's "Mer" tab) when
   * the selected category has secondary filters, "search" otherwise. */
  moreSection?: NativeAdvancedSearchSection;
};

/**
 * Quick-access chip row for native. Every chip is a shortcut into the
 * relevant tab of the single NativeAdvancedSearch panel — there is no
 * per-chip editing UI here anymore, so price/condition/location can't drift
 * out of sync with what the panel shows.
 */
export function NativeFilterChips({
  min,
  max,
  includeFree,
  conditions,
  location,
  onOpenAdvanced,
  advancedFilterCount = 0,
  hideCondition = false,
  moreSection = "search",
}: Props) {
  const open = (section: NativeAdvancedSearchSection) => {
    void hapticImpact("light");
    onOpenAdvanced(section);
  };

  const { label: priceLabel, active: priceActive } = getPriceChipState(min, max, includeFree);
  const { label: condLabel, active: condActive } = getConditionChipState(conditions);
  const locActive = location.lat != null;
  const locLabel = locActive ? (location.label ? location.label.split(",")[0] : "Sted") : "Sted";

  // No wrapping row here — the caller renders this together with
  // AttributeFilterChips' primary chips in one shared scroll row, so all
  // native filter chips read as a single bar instead of two stacked ones.
  return (
    <>
      <FilterChip
        label={priceLabel}
        active={priceActive}
        icon={<span className="text-[11px] font-bold">kr</span>}
        onClick={() => open("price")}
        hideChevron
      />
      {!hideCondition && (
        <FilterChip
          label={condLabel}
          active={condActive}
          icon={<span className="text-[11px]">✦</span>}
          onClick={() => open("price")}
          hideChevron
        />
      )}
      <FilterChip
        label={locLabel}
        active={locActive}
        icon={<MapPin className="size-3.5" />}
        onClick={() => open("location")}
        hideChevron
      />
      <FilterChip
        label="Mer"
        active={advancedFilterCount > 0}
        icon={<MoreHorizontal className="size-3.5" />}
        onClick={() => open(moreSection)}
        badge={advancedFilterCount > 0 ? advancedFilterCount : undefined}
        hideChevron
      />
    </>
  );
}
