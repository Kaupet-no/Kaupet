import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

/** «Kaupet foreslår <kategoristi>» med «Riktig» og «Endre» — kategoriforslaget
 * fra tittelen (eller bildene) som en synlig, handlingsbar chip i stedet for
 * en stille overskriving. Delt av salgsflytens «Om tingen» og Ønskes kjøpt. */
export function CategorySuggestionChip({
  path,
  onAccept,
  onChange,
}: {
  path: string | null;
  onAccept: () => void;
  onChange: () => void;
}) {
  return (
    <div
      data-testid="category-suggestion-chip"
      className="space-y-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm"
    >
      <div className="flex items-center gap-1.5">
        <span className="inline-flex items-center gap-1 font-medium text-brand-text">
          <Sparkles className="size-4 shrink-0" aria-hidden />
          Kaupet foreslår
        </span>
        <span className="min-w-0">{path}</span>
      </div>
      <div className="flex items-center gap-2">
        <Button
          type="button"
          size="sm"
          data-testid="category-suggestion-accept"
          className="native-touch-target"
          onClick={onAccept}
        >
          Riktig
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="native-touch-target"
          onClick={onChange}
        >
          Endre
        </Button>
      </div>
    </div>
  );
}
