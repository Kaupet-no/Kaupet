import { Pencil } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

/**
 * Kjøretøy-only omregistreringsavgift (re-registration fee) box, extracted
 * out of Price so the generic pris-UI and the kjøretøy-spesifikke
 * avgift-logikken aren't tangled in one file. Purely presentational — all
 * derived values and attribute-mutation logic stay in Price (index.tsx),
 * this only renders them and forwards user actions back up.
 */
export function OmregistreringsavgiftBox({
  omregistreringsavgiftKr,
  calculatedAvgiftKr,
  avgiftOverrideKr,
  avgiftFritatt,
  avgiftInkludert,
  editingAvgift,
  setEditingAvgift,
  onOverrideChange,
  onResetOverride,
  setAvgiftFritatt,
  setAvgiftInkludert,
}: {
  omregistreringsavgiftKr: number | null;
  calculatedAvgiftKr: number | null;
  avgiftOverrideKr: number | null;
  avgiftFritatt: boolean;
  avgiftInkludert: boolean;
  editingAvgift: boolean;
  setEditingAvgift: (v: boolean) => void;
  onOverrideChange: (value: string) => void;
  onResetOverride: () => void;
  setAvgiftFritatt: (checked: boolean) => void;
  setAvgiftInkludert: (checked: boolean) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground">
          Omregistreringsavgift {avgiftOverrideKr != null && "(endret av deg)"}
        </span>
        {avgiftFritatt ? (
          <span className="font-medium text-foreground">Fritatt</span>
        ) : editingAvgift ? (
          <Input
            type="text"
            inputMode="numeric"
            autoFocus
            className="h-7 max-w-[110px] text-xs"
            value={omregistreringsavgiftKr ?? ""}
            onChange={(e) => {
              const digits = e.target.value.replace(/\D/g, "").slice(0, 5);
              onOverrideChange(digits);
            }}
            onBlur={() => setEditingAvgift(false)}
          />
        ) : (
          <button
            type="button"
            onClick={() => setEditingAvgift(true)}
            className="flex items-center gap-1 font-medium text-foreground hover:text-primary"
          >
            {omregistreringsavgiftKr != null
              ? `${omregistreringsavgiftKr.toLocaleString("nb-NO")} kr`
              : "Ikke beregnet — sett beløp"}
            <Pencil className="size-3" aria-hidden />
          </button>
        )}
      </div>
      {!avgiftFritatt && omregistreringsavgiftKr == null && (
        <p className="text-muted-foreground">
          Vi klarte ikke å beregne avgiften automatisk. Dette kan for eksempel skje dersom
          kjøretøyet ikke ble funnet hos Statens Vegvesen. Sett beløpet selv over.
        </p>
      )}
      {!avgiftFritatt && avgiftOverrideKr != null && calculatedAvgiftKr != null && (
        <div className="flex items-center justify-between gap-2 text-muted-foreground">
          <span>Beregnet av Kaupet</span>
          <div className="flex items-center gap-2">
            <span>{calculatedAvgiftKr.toLocaleString("nb-NO")} kr</span>
            <Button
              type="button"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={onResetOverride}
            >
              Tilbakestill
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-1.5 border-t border-border pt-2">
        <label className="flex items-center gap-2">
          <Checkbox checked={avgiftFritatt} onCheckedChange={(v) => setAvgiftFritatt(Boolean(v))} />
          Fritatt omregistreringsavgift
        </label>
        <label className="flex items-center gap-2">
          <Checkbox
            checked={avgiftInkludert}
            onCheckedChange={(v) => setAvgiftInkludert(Boolean(v))}
          />
          Omregistreringsavgift er inkludert i kjøpesummen (selger er ansvarlig for omregistrering)
        </label>
      </div>

      {!avgiftFritatt && !avgiftInkludert && (
        <p className="text-muted-foreground">
          Betales av kjøper til staten ved eierskifte, og kommer i tillegg til kjøpesummen du angir.
          Du kan endre beløpet dersom du mener det er feil. Du selv er ansvarlig for at beløpet som
          oppgis er korrekt.
        </p>
      )}
      {avgiftInkludert && (
        <p className="text-muted-foreground">
          Kjøper betaler da ikke noe ekstra ved eierskifte — du er selv ansvarlig for å registrere
          eierskiftet og betale avgiften.
        </p>
      )}
      <p className="text-muted-foreground">
        Du kan sjekke satsene selv hos{" "}
        <a
          href="https://www.skatteetaten.no/person/avgifter/bil/eierskifte/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline underline-offset-2 hover:text-foreground"
        >
          Skatteetaten
        </a>
        .
      </p>
    </div>
  );
}
