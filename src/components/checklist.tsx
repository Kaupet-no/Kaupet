import { useId, type ComponentProps, type ReactNode } from "react";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/**
 * Byggeklosser for søkbare flervalgslister med ekte avkrysningsbokser i stedet
 * for cmdk. cmdk tvinger role="option" og bruker aria-selected for aktiv rad,
 * og Chromium på Android ignorerer aria-checked på option — TalkBack leste da
 * aktiv rad som valgt og faktisk valg som ikke-valgt (KG-36-F01).
 */

export function ChecklistSearch({ className, ...props }: ComponentProps<typeof Input>) {
  return (
    <Input
      type="search"
      enterKeyHint="done"
      aria-label={props.placeholder}
      className={cn("rounded-none border-0 border-b shadow-none focus-visible:ring-0", className)}
      {...props}
    />
  );
}

export function ChecklistRow({
  label,
  checked,
  onToggle,
  className,
}: {
  label: string;
  checked: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <li>
      <label
        className={cn(
          "flex min-h-11 cursor-pointer items-center gap-2 rounded-sm px-2 text-sm hover:bg-accent",
          className,
        )}
      >
        {/* Radix-boksen er en <button>; Chromium navngir den ikke fra
            omsluttende <label>. */}
        <Checkbox checked={checked} onCheckedChange={onToggle} aria-label={label} />
        {label}
      </label>
    </li>
  );
}

export function ChecklistGroup({ heading, children }: { heading: string; children: ReactNode }) {
  const id = useId();
  return (
    <li role="group" aria-labelledby={id}>
      <div id={id} className="px-2 py-1.5 text-xs font-medium text-muted-foreground">
        {heading}
      </div>
      <ul>{children}</ul>
    </li>
  );
}
