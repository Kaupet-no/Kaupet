import { PackageOpen, Search } from "lucide-react";
import { useId } from "react";

export function AdPickerOptions({ onSell, onBuy }: { onSell: () => void; onBuy: () => void }) {
  const sellLabelId = useId();
  const sellDescriptionId = useId();
  const buyLabelId = useId();
  const buyDescriptionId = useId();

  return (
    <div className="flex flex-col gap-3 pt-2">
      <button
        type="button"
        onClick={onSell}
        aria-labelledby={sellLabelId}
        aria-describedby={sellDescriptionId}
        className="flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition hover:border-primary hover:shadow-sm"
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <PackageOpen className="size-6 text-primary" />
        </div>
        <div>
          <p id={sellLabelId} className="font-semibold">
            Jeg selger eller gir bort noe
          </p>
          <p id={sellDescriptionId} className="text-sm text-muted-foreground">
            Legg ut en annonse med bilder og pris
          </p>
        </div>
      </button>
      <button
        type="button"
        onClick={onBuy}
        aria-labelledby={buyLabelId}
        aria-describedby={buyDescriptionId}
        className="flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition hover:border-primary hover:shadow-sm"
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Search className="size-6 text-secondary-foreground" />
        </div>
        <div>
          <p id={buyLabelId} className="font-semibold">
            Jeg ønsker å kjøpe noe
          </p>
          <p id={buyDescriptionId} className="text-sm text-muted-foreground">
            Legg ut en annonse om noe du vil kjøpe
          </p>
        </div>
      </button>
    </div>
  );
}
