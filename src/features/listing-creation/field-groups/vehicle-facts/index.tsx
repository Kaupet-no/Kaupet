import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";
import { VehicleTitleFields } from "../title-photos";
import { DescriptionField, KeywordChips } from "../description-keywords";

/** Highest mileage a vehicle can report — same cap as the price field, and
 * for the same reason: clamp in the input itself instead of letting the user
 * type past a limit and only finding out afterwards. */
const MAX_MILEAGE_KM = 999_999_999;

/**
 * Kilometerstand — kun for motoriserte kjøretøy (`showMileage`); skjules for
 * campingvogn og tilhenger, som ikke har kilometerteller. Lagres i
 * `attributes.mileage_km`, samme sted den publiserte annonsesiden allerede
 * leser den fra (se src/routes/$kaupetCode.tsx). Formateres som
 * mellomrom-gruppert tall med "km"-etikett, samme mønster som prisfeltet.
 */
function MileageField({
  attributes,
  onAttributesChange,
  extraFieldError,
}: Pick<WizardSharedProps, "attributes" | "onAttributesChange" | "extraFieldError">) {
  const raw = attributes.mileage_km;
  const fieldError = extraFieldError?.field === "mileage_km" ? extraFieldError.message : null;
  return (
    <section className="space-y-2">
      <Label htmlFor="mileage_km">
        Kilometerstand
        <RequiredMark />
      </Label>
      <div className="relative max-w-[200px]">
        <Input
          id="mileage_km"
          type="text"
          inputMode="numeric"
          placeholder="0"
          className="pr-10 text-right"
          aria-invalid={!!fieldError}
          aria-describedby={fieldError ? "mileage-error" : undefined}
          value={formatThousands(raw as string | number | undefined, MAX_MILEAGE_KM)}
          onChange={(e) => {
            const digits = digitsOnlyClamped(e.target.value, MAX_MILEAGE_KM);
            const next = { ...attributes };
            if (digits === "") delete next.mileage_km;
            else next.mileage_km = Number(digits);
            onAttributesChange(next);
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          km
        </span>
      </div>
      {fieldError && (
        <p id="mileage-error" className="text-sm text-destructive">
          {fieldError}
        </p>
      )}
    </section>
  );
}

function SubtitleField({
  register,
  errors,
  subtitle,
}: Pick<WizardSharedProps, "register" | "errors" | "subtitle">) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="subtitle">
          Undertittel <span className="font-normal text-muted-foreground">(valgfritt)</span>
        </Label>
        <span className="text-xs text-muted-foreground">{(subtitle ?? "").length} / 80</span>
      </div>
      <Input
        id="subtitle"
        placeholder="F.eks. Utstyrspakke, modellkode eller annen viktig info"
        aria-invalid={!!errors.subtitle}
        aria-describedby={errors.subtitle ? "vehicle-subtitle-error" : undefined}
        {...register("subtitle")}
      />
      {errors.subtitle && (
        <p id="vehicle-subtitle-error" className="text-sm text-destructive">
          {errors.subtitle.message}
        </p>
      )}
    </section>
  );
}

/**
 * Første av de vehicle-only stegene som erstatter det tidligere
 * overbelastede "Beskrivelse"-steget (se UX-audit): Tittel (autogenerert),
 * Undertittel, Kilometerstand og fritekstbeskrivelsen (+ nøkkelord-chips,
 * gjenbrukt fra `description-keywords` — se den filens eksporterte
 * `DescriptionField`/`KeywordChips`, som er "registry-facing"-wrapperen der
 * kun brukes av ikke-kjøretøy-flyter). Tilstand/kjente feil/vedlikehold
 * ligger i `vehicle-condition`; Pris (+ omregistreringsavgift) har sitt eget
 * dedikerte, visuelt distinkte steg (`vehicle-price`) rett før
 * forhåndsvisning/publisering.
 */
export function VehicleFactsGroup(props: WizardSharedProps) {
  return (
    <>
      <VehicleTitleFields {...props} />
      <SubtitleField {...props} />
      {props.showMileage && <MileageField {...props} />}
      <DescriptionField {...props} />
      <KeywordChips {...props} />
    </>
  );
}
