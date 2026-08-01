import { useEffect, useState } from "react";
import { X } from "lucide-react";

const STORAGE_KEY = "kaupet:filter-hint-seen";

function hasSeenHint(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function markHintSeen(): void {
  try {
    localStorage.setItem(STORAGE_KEY, "1");
  } catch {
    /* ignore */
  }
}

/**
 * One-time inline hint shown above the filter-chip row, teaching new users
 * that tapping a filter adds it as a removable criterion alongside the
 * search text — dismissed permanently on first close/interaction, since the
 * chips themselves (ActiveFilters) are self-explanatory after that.
 */
export function FilterHintBanner({
  /** Set once the user has any active filter/search criterion — the hint has
   * done its job at that point, so it dismisses itself rather than lingering
   * once the behavior it explains has already been discovered. */
  hasActiveCriteria = false,
}: {
  hasActiveCriteria?: boolean;
}) {
  const [dismissed, setDismissed] = useState(hasSeenHint);

  const dismiss = () => {
    markHintSeen();
    setDismissed(true);
  };

  useEffect(() => {
    if (hasActiveCriteria) dismiss();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasActiveCriteria]);

  if (dismissed) return null;

  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
      <span className="flex-1">
        Trykk på et filter, eller skriv rett i søkefeltet ("automatgir", "under 3000 kr",
        "mobiltelefon") — det dukker opp som en fjernbar søkekriterie du kan endre eller slette når
        som helst.
      </span>
      <button
        type="button"
        onClick={dismiss}
        className="shrink-0 rounded-full p-1 hover:bg-muted hover:text-foreground"
        aria-label="Lukk hint"
      >
        <X className="size-3.5" />
      </button>
    </div>
  );
}
