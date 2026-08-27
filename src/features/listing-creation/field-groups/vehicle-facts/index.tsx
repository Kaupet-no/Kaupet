import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";
import { DRIVE_TYPE_OPTIONS, getAxleConfigOptions } from "@/lib/vehicle/vehicle-options";
import type { VehicleLeafSlug } from "@/lib/vehicle/vehicle-classification";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";
import { VehicleTitleFields } from "../title-photos";
import { DescriptionField, KeywordChips } from "../description-keywords";

const DRIVE_TYPE_LEAF_SLUGS: VehicleLeafSlug[] = ["bil", "atv"];
const AXLE_CONFIG_LEAF_SLUGS: VehicleLeafSlug[] = [
  "bobil",
  "lastebil-og-henger",
  "buss-og-minibuss",
];

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
    <section className="w-full space-y-2 sm:w-60">
      <Label htmlFor="mileage_km">
        Kilometerstand
        <RequiredMark />
      </Label>
      <div className="relative">
        <Input
          id="mileage_km"
          type="text"
          inputMode="numeric"
          placeholder="0"
          className="pr-10 text-right"
          aria-required="true"
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

/**
 * Hjuldrift (Bil/ATV) eller Akselkombinasjon (Bobil/Lastebil/Buss) — samme
 * felt-idé, to verdidomener. For Bobil/Lastebil/Buss vet vi antall akslinger
 * fra SVV-oppslaget (`vehicleLookupResult.axle_count`), men ikke hvilke som
 * er drivende, så alternativene begrenses til det akseltallet tillater
 * (se `getAxleConfigOptions`); feltet skjules helt når akseltallet er
 * ukjent siden det da ikke finnes noen gyldige alternativer å velge blant.
 * Lagres i `attributes.drive_type` hhv. `attributes.axle_config`.
 */
function DriveOrAxleField({
  attributes,
  onAttributesChange,
  categoryId,
  categories,
  vehicleLookupResult,
  extraFieldError,
}: Pick<
  WizardSharedProps,
  | "attributes"
  | "onAttributesChange"
  | "categoryId"
  | "categories"
  | "vehicleLookupResult"
  | "extraFieldError"
>) {
  const leafSlug = categories.find((c) => c.id === categoryId)?.slug as VehicleLeafSlug | undefined;

  if (leafSlug && DRIVE_TYPE_LEAF_SLUGS.includes(leafSlug)) {
    const fieldError = extraFieldError?.field === "drive_type" ? extraFieldError.message : null;
    const value = typeof attributes.drive_type === "string" ? attributes.drive_type : undefined;
    return (
      <section className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="drive-type-select">
          Hjuldrift
          <RequiredMark />
        </Label>
        <Select
          value={value}
          onValueChange={(v) => onAttributesChange({ ...attributes, drive_type: v })}
        >
          <SelectTrigger id="drive-type-select" aria-label="Hjuldrift" aria-required="true">
            <SelectValue placeholder="Velg hjuldrift" />
          </SelectTrigger>
          <SelectContent>
            {DRIVE_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
      </section>
    );
  }

  if (leafSlug && AXLE_CONFIG_LEAF_SLUGS.includes(leafSlug)) {
    const options = getAxleConfigOptions(vehicleLookupResult?.axle_count ?? null);
    if (options.length === 0) return null;
    const fieldError = extraFieldError?.field === "axle_config" ? extraFieldError.message : null;
    const value = typeof attributes.axle_config === "string" ? attributes.axle_config : undefined;
    return (
      <section className="min-w-0 flex-1 space-y-2">
        <Label htmlFor="axle-config-select">
          Akselkombinasjon
          <RequiredMark />
        </Label>
        <Select
          value={value}
          onValueChange={(v) => onAttributesChange({ ...attributes, axle_config: v })}
        >
          <SelectTrigger id="axle-config-select" aria-label="Akselkombinasjon" aria-required="true">
            <SelectValue placeholder="Velg akselkombinasjon" />
          </SelectTrigger>
          <SelectContent>
            {options.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {fieldError && <p className="text-sm text-destructive">{fieldError}</p>}
      </section>
    );
  }

  return null;
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
      <div className="flex flex-col gap-4 sm:flex-row sm:gap-6">
        {props.showMileage && <MileageField {...props} />}
        <DriveOrAxleField {...props} />
      </div>
      <DescriptionField {...props} />
      <KeywordChips {...props} />
    </>
  );
}
