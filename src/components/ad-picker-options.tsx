import { PackageOpen, Search } from "lucide-react";

export function AdPickerOptions({ onSell, onBuy }: { onSell: () => void; onBuy: () => void }) {
  return (
    <div className="flex flex-col gap-3 pt-2">
      <button
        type="button"
        onClick={onSell}
        className="flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition hover:border-primary hover:shadow-sm"
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <PackageOpen className="size-6 text-primary" />
        </div>
        <div>
          <p className="font-semibold">Jeg selger eller gir bort noe</p>
          <p className="text-sm text-muted-foreground">Legg ut en annonse med bilder og pris</p>
        </div>
      </button>
      <button
        type="button"
        onClick={onBuy}
        className="flex items-center gap-4 rounded-xl border bg-card p-5 text-left transition hover:border-primary hover:shadow-sm"
      >
        <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary">
          <Search className="size-6 text-secondary-foreground" />
        </div>
        <div>
          <p className="font-semibold">Jeg ønsker å kjøpe noe</p>
          <p className="text-sm text-muted-foreground">Legg ut en ønskes kjøpt-annonse</p>
        </div>
      </button>
    </div>
  );
}
