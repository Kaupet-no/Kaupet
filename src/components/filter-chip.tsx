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
  }
>(({ label, active, icon, badge, hideChevron, className = "", ...rest }, ref) => (
  <button
    ref={ref}
    type="button"
    {...rest}
    className={`relative inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm transition active:scale-[0.97] ${
      active
        ? "border-primary bg-primary font-medium text-primary-foreground"
        : "border-border bg-card text-foreground hover:bg-muted"
    } ${className}`}
  >
    {icon}
    <span className="max-w-[160px] truncate">{label}</span>
    {!hideChevron && <ChevronDown className="size-3.5 opacity-60" />}
    {badge != null && badge > 0 && (
      <span className="absolute -right-1.5 -top-1.5 flex size-4 items-center justify-center rounded-full bg-accent text-[10px] font-bold text-white">
        {badge}
      </span>
    )}
  </button>
));
FilterChip.displayName = "FilterChip";
