import { Check } from "lucide-react";

export function ModeToggle({
  value,
  onChange,
  labels,
  compact = false,
}: {
  value: "all" | "any";
  onChange: (v: "all" | "any") => void;
  labels: [string, string];
  /** Lightweight text-pair rendering for contexts where the full pill would
   * duplicate a bordered control that's already right above it (e.g. next to
   * InclusionToggle in TermGroupRow) — same control, less visual weight. */
  compact?: boolean;
}) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs">
        <button
          type="button"
          onClick={() => onChange("all")}
          aria-pressed={value === "all"}
          className={`rounded px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === "all"
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {labels[0]}
        </button>
        <span className="text-muted-foreground" aria-hidden="true">
          ·
        </span>
        <button
          type="button"
          onClick={() => onChange("any")}
          aria-pressed={value === "any"}
          className={`rounded px-1 py-0.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            value === "any"
              ? "font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {labels[1]}
        </button>
      </div>
    );
  }

  const optionClass =
    "native-touch-target flex h-9 min-w-28 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring native:h-auto native:min-w-0 native:flex-1 native:py-2";

  return (
    <div
      className="flex w-fit max-w-full rounded-lg border border-border bg-card p-0.5 text-sm native:w-full native:p-1"
      role="group"
      aria-label="Hvordan søkeordene skal kombineres"
    >
      <button
        type="button"
        onClick={() => onChange("all")}
        aria-pressed={value === "all"}
        className={`${optionClass} ${
          value === "all"
            ? "bg-muted font-medium text-foreground native:bg-primary native:text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Check
          className={`size-3.5 shrink-0 ${value === "all" ? "text-primary opacity-100 native:text-primary-foreground" : "opacity-0"}`}
          aria-hidden
        />
        {labels[0]}
      </button>
      <button
        type="button"
        onClick={() => onChange("any")}
        aria-pressed={value === "any"}
        className={`${optionClass} ${
          value === "any"
            ? "bg-muted font-medium text-foreground native:bg-primary native:text-primary-foreground"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        }`}
      >
        <Check
          className={`size-3.5 shrink-0 ${value === "any" ? "text-primary opacity-100 native:text-primary-foreground" : "opacity-0"}`}
          aria-hidden
        />
        {labels[1]}
      </button>
    </div>
  );
}
