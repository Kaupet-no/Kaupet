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
    <div className="flex w-full rounded-xl border border-border bg-card p-1 text-sm">
      <button
        type="button"
        onClick={() => onChange("all")}
        className={`native-touch-target min-h-12 flex-1 rounded-lg px-3 py-2 transition ${
          value === "all" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {labels[0]}
      </button>
      <button
        type="button"
        onClick={() => onChange("any")}
        className={`native-touch-target min-h-12 flex-1 rounded-lg px-3 py-2 transition ${
          value === "any" ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        {labels[1]}
      </button>
    </div>
  );
}
