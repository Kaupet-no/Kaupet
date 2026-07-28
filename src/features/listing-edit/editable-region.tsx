import { useState, type ReactNode } from "react";

import { cn } from "@/lib/utils";
import { useListingEdit } from "./edit-mode-context";

export type EditableRegionProps = {
  render: () => ReactNode;
  panel: (props: { close: () => void }) => ReactNode;
  className?: string;
  /** Skips the click-to-open affordance and always shows `panel` — used for
   * regions that open an external modal instead (category, plate) via
   * `onOpen` rather than an inline panel. */
  onOpen?: () => void;
};

/**
 * Region wrapper for composite sections whose fields share a single save
 * (location, vehicle-condition, vehicle facts, equipment, generic category
 * attributes) — same dashed-border/hover styling as `EditableField`, but
 * click opens an inline panel instead of a single input.
 */
export function EditableRegion({ render, panel, className, onOpen }: EditableRegionProps) {
  const ctx = useListingEdit();
  const [open, setOpen] = useState(false);

  if (!ctx || !ctx.editMode) {
    return <>{render()}</>;
  }

  if (onOpen) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={onOpen}
        onKeyDown={(e) => {
          if (e.key === "Enter") onOpen();
        }}
        className={cn(
          "cursor-pointer rounded-md border border-dashed border-border/60 transition-colors hover:border-primary/50 hover:bg-primary/5",
          className,
        )}
      >
        {render()}
      </div>
    );
  }

  if (open) {
    return <div className={className}>{panel({ close: () => setOpen(false) })}</div>;
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setOpen(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter") setOpen(true);
      }}
      className={cn(
        "cursor-pointer rounded-md border border-dashed border-border/60 transition-colors hover:border-primary/50 hover:bg-primary/5",
        className,
      )}
    >
      {render()}
    </div>
  );
}
