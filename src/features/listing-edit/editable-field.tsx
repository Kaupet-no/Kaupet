import { useContext, useEffect, useRef, useState, type Context, type ReactNode } from "react";
import { Loader2, Check, AlertCircle } from "lucide-react";

import { cn } from "@/lib/utils";
import { ListingEditContext, type FieldStatus } from "./edit-mode-context";

/** Minimal shape `EditableField`/`EditableRegion` actually need — lets other
 * inline-edit surfaces (e.g. WTB listings) supply their own context instead
 * of `ListingEditContext`, which also carries listing-specific fields
 * (`saveField`, `behavior`, modal openers) these two components never touch. */
export type BaseEditContextValue = {
  editMode: boolean;
  fieldStatus: Record<string, FieldStatus>;
};

export type EditableFieldProps<T, C extends BaseEditContextValue = BaseEditContextValue> = {
  fieldKey: string;
  value: T;
  render: (value: T) => ReactNode;
  editRender: (props: {
    value: T;
    onChange: (v: T) => void;
    // Optional value lets callers commit synchronously right after a
    // selection (e.g. a Select's onValueChange) without waiting for the
    // `draft` state update from onChange to land in a re-render first.
    onCommit: (v?: T) => void;
    onCancel: () => void;
  }) => ReactNode;
  onSave: (v: T) => Promise<void>;
  validate?: (v: T) => string | null;
  className?: string;
  /** Defaults to `ListingEditContext` — pass a different context to reuse
   * this component outside of listing editing. */
  context?: Context<C | null>;
};

/**
 * Inline-edit wrapper for a single field. Buyer view / `useListingEdit()`
 * returning null renders only `render(value)`, byte-for-byte identical to
 * before this feature. In edit mode: inactive shows the dashed-border/hover
 * affordance around the read view, click activates `editRender`, blur/
 * confirm validates and autosaves, Escape cancels without saving.
 */
export function EditableField<T, C extends BaseEditContextValue = BaseEditContextValue>({
  fieldKey,
  value,
  render,
  editRender,
  onSave,
  validate,
  className,
  context = ListingEditContext as unknown as Context<C | null>,
}: EditableFieldProps<T, C>) {
  const ctx = useContext(context);
  const [active, setActive] = useState(false);
  const [draft, setDraft] = useState<T>(value);
  const [error, setError] = useState<string | null>(null);
  const savingRef = useRef(false);

  useEffect(() => {
    if (!active) setDraft(value);
  }, [value, active]);

  if (!ctx || !ctx.editMode) {
    return <>{render(value)}</>;
  }

  const status = ctx.fieldStatus[fieldKey];

  async function commit(overrideValue?: T) {
    if (savingRef.current) return;
    const v = overrideValue !== undefined ? overrideValue : draft;
    const err = validate?.(v) ?? null;
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    savingRef.current = true;
    try {
      await onSave(v);
      setActive(false);
    } catch {
      // status/toast handled by saveField
    } finally {
      savingRef.current = false;
    }
  }

  function cancel() {
    setDraft(value);
    setError(null);
    setActive(false);
  }

  if (active) {
    return (
      <div
        className={cn("relative", className)}
        onKeyDown={(e) => {
          if (e.key === "Escape") cancel();
        }}
      >
        {editRender({
          value: draft,
          onChange: setDraft,
          onCommit: commit,
          onCancel: cancel,
        })}
        <div className="mt-1 flex items-center gap-2 text-xs">
          {status === "saving" && (
            <span className="flex items-center gap-1 text-muted-foreground">
              <Loader2 className="size-3 animate-spin" /> Lagrer …
            </span>
          )}
          {error && (
            <span className="flex items-center gap-1 text-destructive">
              <AlertCircle className="size-3" /> {error}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => setActive(true)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setActive(true);
        }
      }}
      className={cn(
        "cursor-pointer rounded-md border border-dashed border-border/60 transition-colors hover:border-primary/50 hover:bg-primary/5",
        className,
      )}
    >
      {render(value)}
      {status === "saved" && (
        <span className="ml-2 inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
          <Check className="size-3" /> Lagret
        </span>
      )}
    </div>
  );
}
