import { useMemo, useState } from "react";
import { AttributeFields, useAllCategoryFilters } from "@/components/attribute-fields";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  effectiveFiltersForCategory,
  filterDependencyMet,
  getMissingRequiredFilters,
  type CategoryFilter,
} from "@/lib/category-filters";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";
import { DRIVE_TYPE_OPTIONS, getAxleConfigOptions } from "@/lib/vehicle/vehicle-options";
import {
  VEHICLE_LOOKUP_FILTER_KEYS,
  VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS,
} from "@/lib/vehicle/vehicle-lookup.types";
import { firstRegistrationYear } from "@/lib/vehicle/first-registration";
import { parseVehicleLookup } from "@/lib/vehicle/parse-vehicle-lookup";
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
const VEHICLE_FACTS_EDITED_KEYS: Record<string, true> = { drive_type: true, axle_config: true };

const VEHICLE_LOOKUP_FILTER_KEY_SET = new Set<string>(VEHICLE_LOOKUP_FILTER_KEYS);

const VEHICLE_LOOKUP_SNAPSHOT_KEYS = new Set<string>([
  ...VEHICLE_LOOKUP_FILTER_KEYS,
  "brand",
  "model",
  "first_registration_date",
  "vin",
]);
function hasDriveOrAxleFieldForCategory(
  categories: WizardSharedProps["categories"],
  categoryId: string | null,
  axleCount: number | null | undefined,
) {
  const leafSlug = categories.find((category) => category.id === categoryId)?.slug;
  if (leafSlug && DRIVE_TYPE_LEAF_SLUGS.includes(leafSlug as VehicleLeafSlug)) return true;
  if (leafSlug && AXLE_CONFIG_LEAF_SLUGS.includes(leafSlug as VehicleLeafSlug)) {
    return getAxleConfigOptions(axleCount ?? null).length > 0;
  }
  return false;
}

type OptionalVehicleTechnicalField =
  | (Pick<CategoryFilter, "key" | "label_nb"> & { kind: "attribute" })
  | {
      key: "first_registration_date" | "vin";
      label_nb: string;
      kind: "raw";
      value: string;
    };

function OptionalVehicleTechnicalFields({
  categoryId,
  categories,
  attributes,
  onAttributesChange,
  technicalFields,
  onRawChange,
}: Pick<WizardSharedProps, "categoryId" | "categories" | "attributes" | "onAttributesChange"> & {
  technicalFields: readonly OptionalVehicleTechnicalField[];
  onRawChange: (key: "first_registration_date" | "vin", value: string) => void;
}) {
  const [selectedKey, setSelectedKey] = useState<string>();
  const activeField =
    (selectedKey && technicalFields.find((field) => field.key === selectedKey)) ??
    technicalFields[0];

  if (!activeField) return null;

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="vehicle-optional-technical-field">
          Andre tekniske opplysninger{" "}
          <span className="font-normal text-muted-foreground">(valgfritt)</span>
        </Label>
        <Select value={activeField.key} onValueChange={setSelectedKey}>
          <SelectTrigger
            id="vehicle-optional-technical-field"
            aria-label="Andre tekniske opplysninger"
          >
            <SelectValue placeholder="Velg opplysning" />
          </SelectTrigger>
          <SelectContent>
            {technicalFields.map((field) => {
              const value = field.kind === "raw" ? field.value : attributes[field.key];
              const isPopulated =
                value !== undefined &&
                value !== null &&
                value !== "" &&
                (!Array.isArray(value) || value.length > 0);
              return (
                <SelectItem key={field.key} value={field.key}>
                  {field.label_nb}
                  {isPopulated ? " (utfylt)" : ""}
                </SelectItem>
              );
            })}
          </SelectContent>
        </Select>
      </div>
      {activeField.kind === "attribute" ? (
        <AttributeFields
          categoryId={categoryId}
          categories={categories}
          value={attributes}
          onChange={onAttributesChange}
          filterKeys={[activeField.key]}
          required={false}
          heading={null}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor={`vehicle-${activeField.key}`}>{activeField.label_nb}</Label>
          <Input
            id={`vehicle-${activeField.key}`}
            value={activeField.value}
            onChange={(event) => onRawChange(activeField.key, event.target.value)}
            aria-label={activeField.label_nb}
          />
        </div>
      )}
    </div>
  );
}

function syncVehicleLookupSnapshot(
  previous: WizardSharedProps["attributes"],
  next: WizardSharedProps["attributes"],
  patch: Record<string, unknown> = {},
) {
  const lookup = parseVehicleLookup(next.vehicle_lookup ?? previous.vehicle_lookup);
  if (!lookup) return next;

  const snapshot = { ...lookup } as Record<string, unknown>;
  let changed = false;
  for (const key of VEHICLE_LOOKUP_SNAPSHOT_KEYS) {
    if (next[key] !== previous[key]) {
      snapshot[key] = next[key] ?? null;
      changed = true;
    }
  }
  for (const [key, value] of Object.entries(patch)) {
    if (snapshot[key] !== value) {
      snapshot[key] = value;
      changed = true;
    }
  }

  return changed ? { ...next, vehicle_lookup: JSON.stringify(snapshot) } : next;
}

function MissingVehicleTechnicalFields(props: WizardSharedProps) {
  const [open, setOpen] = useState(false);
  const persistedLookup = useMemo(
    () => parseVehicleLookup(props.attributes.vehicle_lookup),
    [props.attributes.vehicle_lookup],
  );
  const lookup = props.vehicleLookupResult ?? persistedLookup;
  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(
    () => new Map(props.categories.map((category) => [category.id, category])),
    [props.categories],
  );
  const { optionalTechnicalFilters, missingRequiredFilterKeys } = useMemo(() => {
    if (!props.vehicleRegistered || !lookup) {
      return { optionalTechnicalFilters: [], missingRequiredFilterKeys: [] };
    }

    const effectiveFilters = effectiveFiltersForCategory(
      props.categoryId,
      allFilters ?? [],
      categoriesById,
    );
    const optionalLookupKeys = new Set<string>(VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS);
    const missingRequiredKeys = getMissingRequiredFilters(
      props.categoryId,
      allFilters ?? [],
      categoriesById,
      props.attributes,
    )
      .filter(
        (filter) =>
          VEHICLE_LOOKUP_FILTER_KEY_SET.has(filter.key) &&
          filter.key !== "drive_type" &&
          !VEHICLE_FACTS_EDITED_KEYS[filter.key] &&
          !optionalLookupKeys.has(filter.key),
      )
      .map((filter) => filter.key);
    const missingRequiredKeySet = new Set(missingRequiredKeys);
    const optionalTechnicalFilters = effectiveFilters
      .filter(
        (filter) =>
          VEHICLE_LOOKUP_FILTER_KEY_SET.has(filter.key) &&
          filter.key !== "drive_type" &&
          !missingRequiredKeySet.has(filter.key) &&
          filterDependencyMet(filter, props.attributes),
      )
      .map(({ key, label_nb }) => ({ key, label_nb }));

    return {
      optionalTechnicalFilters,
      missingRequiredFilterKeys: missingRequiredKeys,
    };
  }, [
    allFilters,
    categoriesById,
    props.attributes,
    props.categoryId,
    lookup,
    props.vehicleRegistered,
  ]);
  const editableLookup = persistedLookup ?? lookup;
  const hasDriveOrAxleField = hasDriveOrAxleFieldForCategory(
    props.categories,
    props.categoryId,
    lookup?.axle_count,
  );
  const firstRegistrationValue =
    editableLookup?.first_registration_date ??
    (typeof props.attributes.first_registration_date === "string"
      ? props.attributes.first_registration_date
      : "");
  const vinValue =
    editableLookup?.vin ?? (typeof props.attributes.vin === "string" ? props.attributes.vin : "");
  const optionalTechnicalFields: OptionalVehicleTechnicalField[] = [
    ...optionalTechnicalFilters.map((field) => ({ ...field, kind: "attribute" as const })),
    {
      key: "first_registration_date",
      label_nb: "Førstegangsregistrering",
      kind: "raw",
      value: firstRegistrationValue,
    },
    {
      key: "vin",
      label_nb: "VIN",
      kind: "raw",
      value: vinValue,
    },
  ];
  // optionalTechnicalFields always carries first_registration_date + vin, so
  // the details block is shown for every lookup.
  if (!lookup) return null;

  const syncAttributes = (next: WizardSharedProps["attributes"], patch?: Record<string, unknown>) =>
    props.onAttributesChange(syncVehicleLookupSnapshot(props.attributes, next, patch));
  const detailsId = "vehicle-technical-details-content";
  const handleRawChange = (key: "first_registration_date" | "vin", value: string) => {
    const next = { ...props.attributes };
    if (value) next[key] = value;
    else delete next[key];
    if (key === "first_registration_date") {
      const year = firstRegistrationYear(value);
      if (year == null) delete next.first_registration_year;
      else next.first_registration_year = year;
    }
    syncAttributes(next, { [key]: value || null });
  };
  const requiredFields =
    hasDriveOrAxleField || missingRequiredFilterKeys.length > 0 ? (
      <section aria-labelledby="vehicle-required-technical-heading" className="space-y-4">
        <h3 id="vehicle-required-technical-heading" className="text-sm font-medium">
          Tekniske opplysninger du må fylle ut
        </h3>
        <div className="space-y-4">
          {hasDriveOrAxleField && (
            <DriveOrAxleField
              {...props}
              vehicleLookupResult={lookup}
              onAttributesChange={syncAttributes}
            />
          )}
          {missingRequiredFilterKeys.length > 0 && (
            <AttributeFields
              categoryId={props.categoryId}
              categories={props.categories}
              value={props.attributes}
              onChange={syncAttributes}
              filterKeys={missingRequiredFilterKeys}
              required
              showErrors={props.attributesTouched}
              heading={null}
            />
          )}
        </div>
      </section>
    ) : null;

  return (
    <div className="space-y-4">
      {requiredFields}
      <details
        open={open}
        onToggle={(event) => setOpen(event.currentTarget.open)}
        className="rounded-xl border border-border"
      >
        <summary
          aria-controls={detailsId}
          className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden"
        >
          <span>
            <span className="block text-sm font-medium">Tekniske detaljer</span>
            <span className="block text-xs text-muted-foreground">
              Forhåndsutfylte opplysninger fra Statens vegvesen
            </span>
          </span>
          <span aria-hidden className="text-muted-foreground">
            {open ? "−" : "+"}
          </span>
        </summary>
        <div id={detailsId} className="space-y-4 border-t border-border p-4">
          <p className="text-sm text-muted-foreground">
            Velg en opplysning for å se eller endre verdien. Opplysninger fra Statens vegvesen er
            forhåndsutfylt når de finnes. Alle feltene er valgfrie.
          </p>
          <OptionalVehicleTechnicalFields
            categoryId={props.categoryId}
            categories={props.categories}
            attributes={props.attributes}
            onAttributesChange={syncAttributes}
            technicalFields={optionalTechnicalFields}
            onRawChange={handleRawChange}
          />
        </div>
      </details>
    </div>
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
  const showUnregisteredDriveOrAxleField =
    !props.vehicleRegistered &&
    hasDriveOrAxleFieldForCategory(
      props.categories,
      props.categoryId,
      props.vehicleLookupResult?.axle_count,
    );

  return (
    <>
      <VehicleTitleFields {...props} />
      <SubtitleField {...props} />
      {props.showMileage && <MileageField {...props} />}
      {showUnregisteredDriveOrAxleField && (
        <section aria-labelledby="vehicle-required-technical-heading" className="mt-4 space-y-4">
          <h3 id="vehicle-required-technical-heading" className="text-sm font-medium">
            Tekniske opplysninger du må fylle ut
          </h3>
          <DriveOrAxleField {...props} />
        </section>
      )}
      {props.vehicleRegistered && <MissingVehicleTechnicalFields {...props} />}
      <DescriptionField {...props} />
      <KeywordChips {...props} />
    </>
  );
}
