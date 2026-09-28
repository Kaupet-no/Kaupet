import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RangeSlider } from "@/components/ui/range-slider";
import { clampToBounds, formatRangeValue, type RangeBounds } from "@/lib/filter-range-bounds";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";

export type RangeValue = { min?: number; max?: number };

/**
 * A from–to numeric filter as a two-thumb slider plus the two number inputs,
 * kept in sync: dragging fills the inputs, typing moves the thumbs. Used for
 * price and for every numeric (`number`/`range`) category filter — årsmodell,
 * kilometerstand and friends — so the search page has one range control
 * instead of a slider in some places and a bare input pair in others.
 *
 * An undefined min/max means "unbounded", and the slider shows the bound's
 * extreme for it; committing a change only reports the edges the user has
 * actually moved off their extreme, so an untouched side stays unbounded.
 */
export function RangeFilterField({
  label,
  bounds,
  value,
  onChange,
  disabled = false,
  compact = false,
  variant = "default",
  histogram,
  inputMax,
}: {
  label: string;
  bounds: RangeBounds;
  value: RangeValue;
  /** Called on commit (slider release / input blur), not per keystroke. */
  onChange: (next: RangeValue) => void;
  /** Greys out the slider/inputs — for a field that only makes sense once a
   * sibling toggle is on (e.g. "Tillatt hengervekt" needs "Hengerfeste"). */
  disabled?: boolean;
  compact?: boolean;
  /** "sheet" er telefonens filterskuff: fordeling og slider øverst, så
   * Fra/Til som merkede felt. Skuffen har selv tittelen, så ingen etikett-rad. */
  variant?: "default" | "sheet";
  /** Antall treff per like bred søyle over `bounds`, vist over slideren. */
  histogram?: number[];
  /** Øvre grense for inntasting når slideren viser en kortere skala enn det
   * som finnes (toppen av slideren betyr da «og mer»). */
  inputMax?: number;
}) {
  const inputBounds =
    inputMax != null ? { ...bounds, max: Math.max(bounds.max, inputMax) } : bounds;
  const [minDraft, setMinDraft] = useState(value.min != null ? String(value.min) : "");
  const [maxDraft, setMaxDraft] = useState(value.max != null ? String(value.max) : "");

  // Re-sync when the applied value changes outside this field (e.g. the filter
  // was removed from the ActiveFilters row above the results).
  useEffect(() => {
    setMinDraft(value.min != null ? String(value.min) : "");
  }, [value.min]);
  useEffect(() => {
    setMaxDraft(value.max != null ? String(value.max) : "");
  }, [value.max]);

  const sliderMin = minDraft ? clampToBounds(Number(minDraft), bounds) : bounds.min;
  const sliderMaxRaw = maxDraft ? clampToBounds(Number(maxDraft), bounds) : bounds.max;
  const sliderMax = Math.max(sliderMin, sliderMaxRaw);

  const commit = (min: string, max: string) => {
    const mn = min ? clampToBounds(Number(min), inputBounds) : undefined;
    const mx = max ? clampToBounds(Number(max), inputBounds) : undefined;
    // Swap reversed manual entry rather than silently returning no results.
    if (mn != null && mx != null && mn > mx) {
      setMinDraft(String(mx));
      setMaxDraft(String(mn));
      onChange({ min: mx, max: mn });
      return;
    }
    onChange({ min: mn, max: mx });
  };

  const onSlide = ([mn, mx]: number[]) => {
    setMinDraft(mn === bounds.min ? "" : String(mn));
    setMaxDraft(mx === bounds.max ? "" : String(mx));
  };

  const slider = (
    <RangeSlider
      min={bounds.min}
      max={bounds.max}
      step={bounds.step}
      value={[sliderMin, sliderMax]}
      thumbLabels={[`Fra ${label.toLowerCase()}`, `Til ${label.toLowerCase()}`]}
      onValueChange={onSlide}
      onValueCommit={([mn, mx]) =>
        commit(mn === bounds.min ? "" : String(mn), mx === bounds.max ? "" : String(mx))
      }
      disabled={disabled}
    />
  );

  if (variant === "sheet") {
    const field = (side: "min" | "max") => {
      const draft = side === "min" ? minDraft : maxDraft;
      const setDraft = side === "min" ? setMinDraft : setMaxDraft;
      const name = side === "min" ? "Fra" : "Til";
      return (
        <label className="flex min-h-14 flex-col justify-center rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/30">
          <span className="text-xs text-muted-foreground">{name}</span>
          <span className="flex items-baseline gap-1">
            <input
              inputMode="numeric"
              aria-label={`${name} ${label.toLowerCase()}`}
              placeholder={side === "min" ? "0" : "Ingen grense"}
              className="w-full min-w-0 bg-transparent text-base font-medium tabular-nums outline-none placeholder:font-normal placeholder:text-muted-foreground"
              value={formatThousands(draft, inputBounds.max, bounds.noGrouping)}
              onChange={(e) => setDraft(digitsOnlyClamped(e.target.value, inputBounds.max))}
              onBlur={() => commit(minDraft, maxDraft)}
              onKeyDown={(e) => e.key === "Enter" && commit(minDraft, maxDraft)}
              disabled={disabled}
            />
            {bounds.unit && (draft || side === "min") && (
              <span className="text-base font-medium">{bounds.unit}</span>
            )}
          </span>
        </label>
      );
    };
    const peak = Math.max(1, ...(histogram ?? []));
    const bucketWidth = histogram?.length ? (bounds.max - bounds.min) / histogram.length : 0;
    return (
      <div className="space-y-4">
        {/* Slideren tar sin egen gest; skuffen skal ikke dras av den. */}
        <div data-vaul-no-drag className="px-3 pt-2">
          {histogram && histogram.length > 0 && (
            <div className="flex h-16 items-end gap-0.5" aria-hidden="true">
              {histogram.map((count, index) => {
                const center = bounds.min + bucketWidth * (index + 0.5);
                const inRange = center >= sliderMin && center <= sliderMax;
                return (
                  <span
                    key={index}
                    className={`flex-1 rounded-t-sm transition-colors ${inRange ? "bg-primary/80" : "bg-border"}`}
                    style={{ height: `${Math.max(count ? 8 : 3, (count / peak) * 100)}%` }}
                  />
                );
              })}
            </div>
          )}
          <div className="py-3">{slider}</div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {field("min")}
          {field("max")}
        </div>
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "space-y-4"}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
        <Label className="font-semibold">{label}</Label>
        <span className="text-xs tabular-nums text-muted-foreground">
          {formatRangeValue(sliderMin, bounds.unit, bounds.noGrouping)} –{" "}
          {formatRangeValue(sliderMax, bounds.unit, bounds.noGrouping)}
          {sliderMax === bounds.max ? "+" : ""}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span className="block">Fra</span>
          <Input
            inputMode="numeric"
            aria-label={`Fra ${label.toLowerCase()}`}
            placeholder="Ingen grense"
            className={`${compact ? "h-9 rounded-md text-sm" : "rounded-xl"} bg-background tabular-nums`}
            value={formatThousands(minDraft, bounds.max, bounds.noGrouping)}
            onChange={(e) => setMinDraft(digitsOnlyClamped(e.target.value, bounds.max))}
            onBlur={() => commit(minDraft, maxDraft)}
            onKeyDown={(e) => e.key === "Enter" && commit(minDraft, maxDraft)}
            disabled={disabled}
          />
        </div>
        <div className="space-y-1.5 text-xs font-medium text-muted-foreground">
          <span className="block">Til</span>
          <Input
            inputMode="numeric"
            aria-label={`Til ${label.toLowerCase()}`}
            placeholder="Ingen grense"
            className={`${compact ? "h-9 rounded-md text-sm" : "rounded-xl"} bg-background tabular-nums`}
            value={formatThousands(maxDraft, bounds.max, bounds.noGrouping)}
            onChange={(e) => setMaxDraft(digitsOnlyClamped(e.target.value, bounds.max))}
            onBlur={() => commit(minDraft, maxDraft)}
            onKeyDown={(e) => e.key === "Enter" && commit(minDraft, maxDraft)}
            disabled={disabled}
          />
        </div>
      </div>
      <div className={compact ? "px-3 py-1" : "px-3 py-3"}>{slider}</div>
    </div>
  );
}
