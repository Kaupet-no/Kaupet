import * as React from "react";
import { ChevronDown } from "lucide-react";

/**
 * The filter pill shared by every chip row on the search page (generic filters,
 * category-attribute filters, native and desktop alike) — previously
 * re-declared per row, which let the active/badge styling drift between them.
 * Forwards its ref so it can be used directly as a Radix `asChild` trigger.
 */
export const FilterChip = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & {
    label: string;
    active: boolean;
    icon?: React.ReactNode;
    badge?: number;
    /** Hides the dropdown caret, for chips that navigate instead of opening. */
    hideChevron?: boolean;
    /** "pill" (default) is the horizontal-scroll chip row. "field" renders the
     * same trigger as a labeled, full-width box — used by the card-style
     * search layout (`AttributeFilterChips`'s `layout="card"`) so every chip
     * type (select/multiselect/brand/model/range popovers) can be reused
     * as-is instead of re-implementing each control a second time. */
    variant?: "pill" | "field";
    /** Label shown above the box in "field" variant, e.g. "Merke". */
    fieldLabel?: string;
  }
>(
  (
    {
      label,
      active,
      icon,
      badge,
      hideChevron,
      variant = "pill",
      fieldLabel,
      className = "",
      ...rest
    },
    ref,
  ) => {
    if (variant === "field") {
      return (
        <div className="flex min-w-0 flex-col gap-1">
          {fieldLabel && (
            <span className="text-xs font-medium text-muted-foreground">{fieldLabel}</span>
          )}
          <button
            ref={ref}
            type="button"
            {...rest}
            className={`relative flex h-11 w-full items-center justify-between gap-1.5 rounded-lg border bg-card px-3 text-left text-sm transition ${
              active
                ? "border-primary/60 font-medium text-foreground"
                : "border-border text-muted-foreground hover:border-primary/40"
            } ${className}`}
          >
            <span className="flex min-w-0 items-center gap-1.5 truncate">
              {icon}
              <span className="truncate">{label}</span>
            </span>
            {!hideChevron && <ChevronDown className="size-4 shrink-0 opacity-60" />}
            {badge != null && badge > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-2xs font-bold text-white">
                {badge}
              </span>
            )}
          </button>
        </div>
      );
    }
    return (
      <button
        ref={ref}
        type="button"
        {...rest}
        className={`native-touch-target relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition active:scale-[0.97] ${
          active
            ? "border-primary bg-primary font-medium text-primary-foreground"
            : "border-border bg-card text-foreground hover:bg-muted"
        } ${className}`}
      >
        {icon}
        <span className="max-w-[160px] truncate">{label}</span>
        {!hideChevron && <ChevronDown className="size-3.5 opacity-60" />}
        {badge != null && badge > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-brand text-2xs font-bold text-white">
            {badge}
          </span>
        )}
      </button>
    );
  },
);
FilterChip.displayName = "FilterChip";
