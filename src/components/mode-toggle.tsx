export function ModeToggle({
  value,
  onChange,
  labels,
}: {
  value: "all" | "any";
  onChange: (v: "all" | "any") => void;
  labels: [string, string];
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`rounded-full px-2.5 py-1 transition ${
          value === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {labels[0]}
      </button>
      <button
        type="button"
        onClick={() => onChange("any")}
        className={`rounded-full px-2.5 py-1 transition ${
          value === "any" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {labels[1]}
      </button>
    </div>
  );
}
