import { cn } from "@/lib/utils";

/**
 * Lite antall-merke (f.eks. uleste meldinger, åpne admin-hendelser). Dekorativt —
 * forelderen må selv bære tallet i sin tilgjengelige tekst/aria-label.
 */
export function CountBadge({ count, className }: { count: number; className?: string }) {
  return (
    <span
      className={cn(
        "pointer-events-none flex h-5 min-w-5 items-center justify-center rounded-full bg-brand px-1 text-2xs font-semibold text-brand-foreground",
        className,
      )}
      aria-hidden="true"
    >
      {count > 9 ? "9+" : count}
    </span>
  );
}
