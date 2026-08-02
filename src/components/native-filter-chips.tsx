import { useState } from "react";
import { MapPin, MoreHorizontal } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { CONDITIONS } from "@/components/advanced-search-value";
import { RangeFilterField } from "@/components/range-filter-field";
import { PRICE_BOUNDS } from "@/lib/filter-range-bounds";
import { hapticImpact } from "@/lib/haptics";
import { getPriceChipState, getConditionChipState } from "@/lib/filter-chip-labels";

type Props = {
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
  /** Hides the "Tilstand" chip — no listing under Bil og MC has that attribute. */
  hideCondition?: boolean;
};

type SheetId = "price" | "condition" | "location" | null;

export function NativeFilterChips({
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
  hideCondition = false,
}: Props) {
  const [openSheet, setOpenSheet] = useState<SheetId>(null);

  const open = (id: SheetId) => {
    void hapticImpact("light");
    setOpenSheet(id);
  };

  const close = () => setOpenSheet(null);

  // Labels for active filters
  const { label: priceLabel, active: priceActive } = getPriceChipState(min, max, includeFree);
  const { label: condLabel, active: condActive } = getConditionChipState(conditions);
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
          label={priceLabel}
          active={priceActive}
          icon={<span className="text-[11px] font-bold">kr</span>}
          onPress={() => open("price")}
        />
        {!hideCondition && (
          <Chip
            label={condLabel}
            active={condActive}
            icon={<span className="text-[11px]">✦</span>}
            onPress={() => open("condition")}
          />
        )}
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

function PriceSheetContent({
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
  const [draft, setDraft] = useState<{ min?: number; max?: number }>({ min, max });
  const [freeDraft, setFreeDraft] = useState(includeFree);

  return (
    <>
      <SheetHeader>
        <SheetTitle>Pris</SheetTitle>
      </SheetHeader>
      <div className="mt-4 space-y-4">
        <RangeFilterField label="Pris" bounds={PRICE_BOUNDS} value={draft} onChange={setDraft} />
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
          onApply(draft.min, draft.max, freeDraft);
        }}
      >
        Bruk prisfilter
      </Button>
    </>
  );
}
