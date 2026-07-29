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
}: {
  label: string;
  bounds: RangeBounds;
  value: RangeValue;
  /** Called on commit (slider release / input blur), not per keystroke. */
  onChange: (next: RangeValue) => void;
}) {
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
    const mn = min ? clampToBounds(Number(min), bounds) : undefined;
    const mx = max ? clampToBounds(Number(max), bounds) : undefined;
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

  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between gap-2">
        <Label>{label}</Label>
        <span className="text-xs text-muted-foreground">
          {formatRangeValue(sliderMin, bounds.unit)} – {formatRangeValue(sliderMax, bounds.unit)}
          {sliderMax === bounds.max ? "+" : ""}
        </span>
      </div>
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
      />
      <div className="flex items-center gap-2">
        <Input
          inputMode="numeric"
          aria-label={`Fra ${label.toLowerCase()}`}
          placeholder="Fra"
          value={formatThousands(minDraft, bounds.max)}
          onChange={(e) => setMinDraft(digitsOnlyClamped(e.target.value, bounds.max))}
          onBlur={() => commit(minDraft, maxDraft)}
          onKeyDown={(e) => e.key === "Enter" && commit(minDraft, maxDraft)}
        />
        <span className="text-muted-foreground">–</span>
        <Input
          inputMode="numeric"
          aria-label={`Til ${label.toLowerCase()}`}
          placeholder="Til"
          value={formatThousands(maxDraft, bounds.max)}
          onChange={(e) => setMaxDraft(digitsOnlyClamped(e.target.value, bounds.max))}
          onBlur={() => commit(minDraft, maxDraft)}
          onKeyDown={(e) => e.key === "Enter" && commit(minDraft, maxDraft)}
        />
      </div>
    </div>
  );
}
