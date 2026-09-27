import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AttributeFields, useAllCategoryFilters } from "@/components/attribute-fields";
import {
  VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS,
  VEHICLE_WIZARD_MANAGED_KEYS,
} from "@/lib/vehicle/vehicle-lookup.types";
import { getMissingRequiredFilters, vehicleCategoryGroupFor } from "@/lib/category-filters";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";
import { matchBrandAndModelInTitle } from "@/lib/vehicle/vehicle-brand-match";
import { computeVehicleTitle } from "@/lib/vehicle/vehicle-title";
import { CategoryIcon } from "@/lib/category-icons";
import {
  LEAF_LABELS_NB,
  VEHICLE_LEAF_SLUGS,
  vehicleLeafCategoriesBySlug,
  type VehicleLeafSlug,
} from "@/lib/vehicle/vehicle-classification";
import {
  VehicleBrandField,
  VehicleModelWithClassField,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";
import { VEHICLE_EQUIPMENT_FILTER_KEYS } from "../vehicle-equipment";

/** Manual "kjøretøy ikke registrert" path fills in technical specs with
 * `required` on — but Merke/Modell are asked directly on this step, and
 * Utstyr (equipment) has its own dedicated, optional step
 * (vehicle-equipment) later in the flow, so all three must stay hidden (and
 * therefore not counted as missing required filters) in that block. */
const HIDDEN_KEYS_FOR_MANUAL_SPECS = [
  ...VEHICLE_WIZARD_MANAGED_KEYS,
  ...VEHICLE_EQUIPMENT_FILTER_KEYS,
  "brand",
  "model",
];
const MANUAL_SPEC_SECTION_KEYS = {
  grunnfakta: ["year", "color", "body_type", "imported_used"],
  drivlinje: [
    "fuel_type",
    "transmission",
    "power_hk",
    "drive_type",
    "cylinders",
    "engine_displacement_cc",
    "engine_code",
  ],
  praktiske: [
    "weight_kg",
    "max_total_weight_kg",
    "length_m",
    "tow_hitch",
    "max_tow_weight_kg",
    "seats",
  ],
  flere: ["next_eu_control", "eu_control_exempt", "sleeping_places"],
} as const;

function hiddenKeysForManualSection(
  allKeys: readonly string[],
  visibleKeys: readonly string[],
): string[] {
  return [...HIDDEN_KEYS_FOR_MANUAL_SPECS, ...allKeys.filter((key) => !visibleKeys.includes(key))];
}

function ManualSpecSection({
  heading,
  sectionId,
  visibleKeys,
  allKeys,
  initialOpen = false,
  hasMissing = false,
  ...props
}: {
  heading: string;
  sectionId: string;
  visibleKeys: readonly string[];
  allKeys: readonly string[];
  initialOpen?: boolean;
  hasMissing?: boolean;
} & Pick<
  WizardSharedProps,
  "categoryId" | "categories" | "attributes" | "onAttributesChange" | "attributesTouched"
>) {
  const [open, setOpen] = useState(initialOpen);
  /* Seksjonen står åpen så lenge den har et tomt påkrevd felt — et påkrevd
     felt skal aldri ligge bak en lukket seksjon. Selve feilmarkeringen venter
     til brukeren har forsøkt å gå videre (`attributesTouched`). */
  const showError = hasMissing && props.attributesTouched;
  const optionalKeys = visibleKeys.filter(
    (key) =>
      allKeys.includes(key) &&
      (VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS as readonly string[]).includes(key),
  );
  const requiredKeys = visibleKeys.filter(
    (key) => !(VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS as readonly string[]).includes(key),
  );

  const errorId = `${sectionId}-error`;
  const contentId = `${sectionId}-content`;

  return (
    <details
      open={open || hasMissing}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      aria-labelledby={sectionId}
      className="rounded-xl border border-border"
    >
      <summary
        aria-controls={contentId}
        aria-describedby={showError ? errorId : undefined}
        className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span id={sectionId} role="heading" aria-level={3} className="text-sm font-medium">
            {heading}
          </span>
          {showError && (
            <span id={errorId} role="status" className="text-sm font-medium text-destructive">
              Mangler påkrevde opplysninger
            </span>
          )}
        </span>
        <span aria-hidden className="text-muted-foreground">
          {open ? "−" : "+"}
        </span>
      </summary>
      <div id={contentId} className="space-y-3 border-t border-border p-4">
        <AttributeFields
          categoryId={props.categoryId}
          categories={props.categories}
          value={props.attributes}
          onChange={props.onAttributesChange}
          showErrors={props.attributesTouched}
          hiddenKeys={hiddenKeysForManualSection(allKeys, requiredKeys)}
          required
        />
        {optionalKeys.length > 0 && (
          <AttributeFields
            categoryId={props.categoryId}
            categories={props.categories}
            value={props.attributes}
            onChange={props.onAttributesChange}
            filterKeys={optionalKeys}
            required={false}
            heading="Valgfritt"
          />
        )}
      </div>
    </details>
  );
}

/**
 * Første steg i kjøretøyflyten etter at kategorien er bekreftet:
 * registreringsnummer/oppslag alene for registrerte kjøretøy, eller manuell
 * merke-, modell- og teknisk registrering for uregistrerte kjøretøy.
 *
 * Merke/Modell forhåndsutfylles fra tittelen brukeren skrev på
 * landingsskjermen ("Porsche 911" → Porsche / 911, se
 * `matchBrandAndModelInTitle`). For registrerte kjøretøy vises disse feltene
 * først sammen med oppslagsbekreftelsen; manglende tekniske opplysninger
 * redigeres på vehicle-facts. Uregistrerte kjøretøy fyller dem manuelt her.
 *
 * Registreringsnummeret brukes kun til å hente *tekniske* data fra SVV.
 * Oppslaget kjøres fra "Bekreft"-knappen ved skiltet (eller wizardens
 * "Neste", se `goToNextPage` i ny-annonse.tsx) — et norsk skilt har aldri
 * mer enn 7 tegn, så feltet er begrenset til det. Underkategorien vises
 * først etter oppslaget (forhåndsvalgt fra SVV-klassifiseringen) eller når
 * brukeren krysser av for at kjøretøyet ikke er registrert; da deaktiveres
 * skiltet og knappen, og de tekniske opplysningene fylles ut manuelt.
 */
export function VehicleRegistration(props: WizardSharedProps) {
  const {
    categories,
    categoryId,
    title,
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    setValue,
    attributes,
    onAttributesChange,
    extraFieldError,
    bilOgMcCategoryId,
    onCategorySelect,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    resetLookupOnReturnToRegistration,
  } = props;

  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryGroup =
    vehicleCategoryGroupFor(categoryId || null, allFilters ?? [], categoriesById) ?? "bil";

  const manualSpecKeys = useMemo(
    () => [...new Set((allFilters ?? []).map((filter) => filter.key))],
    [allFilters],
  );
  const manualSections = useMemo(() => {
    const knownKeys = new Set<string>(Object.values(MANUAL_SPEC_SECTION_KEYS).flat());
    return {
      grunnfakta: MANUAL_SPEC_SECTION_KEYS.grunnfakta,
      drivlinje: MANUAL_SPEC_SECTION_KEYS.drivlinje,
      praktiske: MANUAL_SPEC_SECTION_KEYS.praktiske,
      flere: [
        ...MANUAL_SPEC_SECTION_KEYS.flere,
        ...manualSpecKeys.filter(
          (key) => !knownKeys.has(key) && !HIDDEN_KEYS_FOR_MANUAL_SPECS.includes(key),
        ),
      ],
    };
  }, [manualSpecKeys]);
  const missingManualSpecKeys = useMemo(() => {
    return new Set(
      getMissingRequiredFilters(categoryId, allFilters ?? [], categoriesById, attributes, [
        ...HIDDEN_KEYS_FOR_MANUAL_SPECS,
        ...VEHICLE_LOOKUP_OPTIONAL_FILTER_KEYS,
      ]).map((filter) => filter.key),
    );
  }, [categoryId, allFilters, categoriesById, attributes]);
  const leafBySlug = useMemo(() => vehicleLeafCategoriesBySlug(categories), [categories]);
  const currentLeafSlug = categoriesById.get(categoryId)?.slug as VehicleLeafSlug | undefined;
  const selectedLeafSlug: VehicleLeafSlug =
    currentLeafSlug && leafBySlug.has(currentLeafSlug) ? currentLeafSlug : "bil";

  /** Kategorien er allerede satt til en spesifikk underkategori når
   * category-confirm/category-select har kjørt — denne dekker kun det
   * sjeldne unntaket der brukeren eksplisitt valgte selve "Bil og
   * MC"-roten (via category-confirms "Nei"-fallback). Kjøres én gang,
   * akkurat som tittel-prefillen under. */
  const fallbackAppliedRef = useRef(false);
  useEffect(() => {
    if (fallbackAppliedRef.current) return;
    if (!bilOgMcCategoryId || categoryId !== bilOgMcCategoryId) return;
    const fallback = leafBySlug.get("bil") ?? [...leafBySlug.values()][0];
    if (!fallback) return;
    fallbackAppliedRef.current = true;
    onCategorySelect(fallback.id, fallback.parent_id ?? bilOgMcCategoryId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [categoryId, bilOgMcCategoryId, leafBySlug]);

  function selectSubcategory(leaf: { id: string; parent_id: string | null; slug: string }) {
    const newGroup = vehicleCategoryGroupFor(leaf.id, allFilters ?? [], categoriesById) ?? "bil";
    if (newGroup !== categoryGroup && (attributes.brand || attributes.model)) {
      const next = { ...attributes };
      delete next.brand;
      delete next.model;
      onAttributesChange(next);
    }
    onCategorySelect(leaf.id, leaf.parent_id ?? bilOgMcCategoryId ?? "");
  }

  /** Oppslaget avgjør underkategorien: velg den SVV fant, så brukeren bare
   * trenger å rette den hvis den er feil. */
  const detectedLeafSlug = vehicleClassification?.slug ?? null;
  useEffect(() => {
    const leaf = detectedLeafSlug && leafBySlug.get(detectedLeafSlug as VehicleLeafSlug);
    if (leaf && leaf.id !== categoryId) selectSubcategory(leaf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detectedLeafSlug]);

  const brand = typeof attributes.brand === "string" ? attributes.brand : undefined;
  const model = typeof attributes.model === "string" ? attributes.model : undefined;

  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();

  /** Bare når brukeren ikke allerede har et merke: forslaget skal aldri
   * overskrive et valg brukeren har gjort, heller ikke når de går tilbake
   * hit etter å ha rettet det. Sporer *hvilken* categoryGroup som sist ble
   * forsøkt (ikke bare "kjørt/ikke kjørt") — utelukkende slik at et bytte
   * av underkategori i rutenettet over (som endrer categoryGroup) får et
   * nytt, riktig scopet forsøk, i stedet for å forbli stille på gruppen
   * som gjaldt da denne siden først ble vist. */
  const prefilledForGroupRef = useRef<string | null>(null);
  useEffect(() => {
    if (brand || !title.trim()) return;
    if (prefilledForGroupRef.current === categoryGroup) return;
    if (!allBrands || !allModels) return;
    const match = matchBrandAndModelInTitle(
      title,
      allBrands.filter((b) => b.category_group === categoryGroup),
      (brandId) => allModels.filter((m) => m.brand_id === brandId),
    );
    prefilledForGroupRef.current = categoryGroup;
    if (!match) return;
    const next: typeof attributes = { ...attributes, brand: match.brand };
    if (match.model) next.model = match.model;
    onAttributesChange(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allBrands, allModels, categoryGroup, title, brand]);

  const setAttribute = (key: "brand" | "model", value: string | undefined) => {
    const next = { ...attributes };
    if (value) next[key] = value;
    else delete next[key];
    // Modellisten avhenger av merket, så en tidligere valgt modell gir ikke
    // lenger mening når merket endres.
    if (key === "brand") delete next.model;
    onAttributesChange(next);
  };

  const fieldError = (key: string) =>
    extraFieldError?.field === key ? extraFieldError.message : undefined;

  const lookup = vehicleLookupResult;
  /** SVV-oppslaget uten merke eller modell (sjeldent, f.eks. eldre kjøretøy)
   * — da fyller brukeren begge inn under bekreftelsesmeldingen. */
  const lookupMissingBrandModel = !!lookup && !(lookup.brand && lookup.model);
  const lookupSummary = lookup
    ? [lookup.year, lookup.color?.toLowerCase(), lookup.brand, lookup.model]
        .filter(Boolean)
        .join(" ")
    : "";

  /** Tittelen i forhåndsvisningen følger SVV straks oppslaget er gjort — den
   * samme tittelen VehicleTitleFields ellers ville satt på vehicle-facts. */
  useEffect(() => {
    if (!lookup?.brand || !lookup.model) return;
    const next = computeVehicleTitle({
      brand: lookup.brand,
      model: lookup.model,
      ...(lookup.year ? { year: lookup.year } : {}),
    });
    if (next !== title) setValue("title", next, { shouldValidate: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lookup]);
  const [subcategoryPickerOpen, setSubcategoryPickerOpen] = useState(false);

  const showSubcategory = !vehicleRegistered || (!!lookup && subcategoryPickerOpen);

  return (
    <section className="space-y-5">
      {/* Registreringsnummeret først: oppslaget avgjør uansett underkategorien
          (se detectedSlug/categoryMismatch), så underkategorien vises først
          etter "Bekreft" eller "ikke registrert". Den står likevel foran de
          manuelle merke/modell-feltene, som filtreres av den. */}
      <div className="space-y-3">
        <Label htmlFor="vehicle-reg-nr">
          Registreringsnummer
          {vehicleRegistered && <RequiredMark />}
        </Label>

        {vehicleRegistered && (
          <p className="text-xs text-muted-foreground">
            Trykk Bekreft for å hente tekniske opplysninger automatisk fra Statens vegvesen. Du får
            sjekke og rette opplysningene før annonsen opprettes.
          </p>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <div
            className={`flex h-20 w-72 items-stretch overflow-hidden rounded-lg bg-white shadow-md ${
              vehicleLookupError && vehicleRegistered ? "ring-2 ring-destructive" : ""
            } ${vehicleRegistered ? "" : "opacity-50 grayscale"}`}
          >
            <div className="flex w-10 flex-col items-center justify-center gap-1 bg-blue-700">
              <svg viewBox="0 0 22 16" className="h-4 w-[22px]" aria-hidden>
                <rect width="22" height="16" fill="#ef2b2d" />
                <rect x="6" width="4" height="16" fill="#fff" />
                <rect y="6" width="22" height="4" fill="#fff" />
                <rect x="7" width="2" height="16" fill="#002868" />
                <rect y="7" width="22" height="2" fill="#002868" />
              </svg>
              <span className="text-lg font-bold leading-none text-white">N</span>
            </div>
            <input
              id="vehicle-reg-nr"
              value={vehicleRegNrInput}
              onChange={(e) => {
                setVehicleRegNrInput(e.target.value.toUpperCase().slice(0, 7));
                // Et nytt skilt gjør oppslaget (og underkategorien fra det) utdatert.
                if (lookup) {
                  resetLookupOnReturnToRegistration();
                  setSubcategoryPickerOpen(false);
                }
              }}
              onKeyDown={(e) => {
                if (e.key !== "Enter") return;
                e.preventDefault();
                void runVehicleLookup(vehicleRegNrInput);
              }}
              maxLength={7}
              placeholder="AB 12345"
              disabled={vehicleLookupLoading || !vehicleRegistered}
              aria-required={vehicleRegistered}
              aria-invalid={!!vehicleLookupError && vehicleRegistered}
              aria-describedby={
                vehicleLookupError && vehicleRegistered ? "vehicle-reg-nr-error" : undefined
              }
              className="w-full flex-1 bg-white px-2 text-center font-mono text-4xl font-bold tracking-[0.08em] text-neutral-900 outline-none placeholder:text-black/20 disabled:cursor-not-allowed disabled:opacity-60"
              autoComplete="off"
              autoCapitalize="characters"
            />
          </div>
          <Button
            type="button"
            size="lg"
            onClick={() => void runVehicleLookup(vehicleRegNrInput)}
            disabled={vehicleLookupLoading || !vehicleRegistered}
          >
            Bekreft
          </Button>
        </div>
        {vehicleRegistered && vehicleLookupLoading && (
          <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
            Slår opp kjøretøy…
          </p>
        )}
        {vehicleRegistered && vehicleLookupError && (
          <p
            id="vehicle-reg-nr-error"
            role="alert"
            aria-live="assertive"
            className="text-sm text-destructive"
          >
            {vehicleLookupError}
          </p>
        )}

        {vehicleRegistered && lookup && (
          <div
            role="status"
            aria-live="polite"
            className="space-y-3 rounded-lg border border-border bg-muted/50 p-4 animate-in fade-in slide-in-from-top-2 duration-300 motion-reduce:animate-none"
          >
            <p className="text-sm">
              Dette registreringsnummeret tilhører en{" "}
              <span className="font-medium">{lookupSummary}</span>. Annonsen blir opprettet i
              underkategori <span className="font-medium">{LEAF_LABELS_NB[selectedLeafSlug]}</span>.
            </p>
            <p className="text-xs text-muted-foreground">Kjøretøydata fra Statens vegvesen</p>
            {!subcategoryPickerOpen && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setSubcategoryPickerOpen(true)}
              >
                Endre underkategori
              </Button>
            )}
          </div>
        )}
        {vehicleRegistered && vehiclePreviousClassificationMismatch && (
          <Alert variant="warning">
            <AlertDescription>
              Sist du slo opp dette registreringsnummeret fikk du en annen kjøretøytype — dette kan
              skje ved eierskifte av personlige kjennemerker. Sjekk at opplysningene over stemmer.
            </AlertDescription>
          </Alert>
        )}

        {!lookup && (
          <div className="flex items-start gap-2">
            <Checkbox
              id="vehicle-not-registered"
              checked={!vehicleRegistered}
              onCheckedChange={(checked) => setVehicleRegistered(!checked)}
            />
            <Label htmlFor="vehicle-not-registered" className="font-normal leading-snug">
              Kjøretøyet er ikke registrert, eller jeg vil ikke oppgi registreringsnummer
            </Label>
          </div>
        )}

        {!vehicleRegistered && (
          <div className="space-y-2 border-t pt-3">
            <p className="text-sm text-muted-foreground">
              Ingen problem — fyll inn kjøretøyets tekniske opplysninger selv.
            </p>
            <div className="space-y-4">
              <ManualSpecSection
                heading="Drivlinje"
                sectionId="vehicle-manual-drivlinje-heading"
                visibleKeys={manualSections.drivlinje}
                allKeys={manualSpecKeys}
                hasMissing={manualSections.drivlinje.some((key) => missingManualSpecKeys.has(key))}
                {...props}
              />
              <ManualSpecSection
                heading="Praktiske opplysninger"
                sectionId="vehicle-manual-praktiske-heading"
                visibleKeys={manualSections.praktiske}
                allKeys={manualSpecKeys}
                hasMissing={manualSections.praktiske.some((key) => missingManualSpecKeys.has(key))}
                {...props}
              />
              <ManualSpecSection
                heading="Flere opplysninger"
                sectionId="vehicle-manual-flere-heading"
                visibleKeys={manualSections.flere}
                allKeys={manualSpecKeys}
                hasMissing={manualSections.flere.some((key) => missingManualSpecKeys.has(key))}
                {...props}
              />
            </div>
          </div>
        )}
      </div>

      {showSubcategory && (
        <div className="space-y-2 border-t pt-4">
          <Label>Underkategori</Label>
          <p className="text-xs text-muted-foreground">
            {(!vehicleRegistered || lookupMissingBrandModel) &&
              "Merke og modell under filtreres etter hvilken underkategori som er valgt. "}
            Velg en annen hvis den markerte ikke stemmer.
          </p>
          <div
            role="radiogroup"
            aria-label="Underkategori"
            className="grid grid-cols-3 gap-2 sm:grid-cols-4"
          >
            {VEHICLE_LEAF_SLUGS.filter((slug) => leafBySlug.has(slug)).map((slug) => {
              const leaf = leafBySlug.get(slug)!;
              const selected = selectedLeafSlug === slug;
              return (
                <button
                  key={slug}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => selectSubcategory(leaf)}
                  className={`flex flex-col items-center gap-1 rounded-lg border p-2 text-xs transition-colors ${
                    selected
                      ? "border-primary bg-primary/10 text-primary font-medium"
                      : "border-border hover:border-primary/40"
                  }`}
                >
                  <CategoryIcon iconName={leaf.icon} className="size-5" />
                  {LEAF_LABELS_NB[slug]}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {(!vehicleRegistered || lookupMissingBrandModel) && (
        <section className="space-y-4 border-t pt-4">
          <VehicleBrandField
            categoryGroup={categoryGroup}
            value={brand}
            onChange={(v) => setAttribute("brand", v)}
            required
            error={fieldError("brand")}
          />
          <VehicleModelWithClassField
            categoryGroup={categoryGroup}
            brandName={brand}
            value={model}
            onChange={(v) => setAttribute("model", v)}
            required
            error={fieldError("model")}
          />
          {!vehicleRegistered && (
            <ManualSpecSection
              heading="Grunnfakta"
              sectionId="vehicle-manual-grunnfakta-heading"
              visibleKeys={manualSections.grunnfakta}
              allKeys={manualSpecKeys}
              initialOpen
              hasMissing={manualSections.grunnfakta.some((key) => missingManualSpecKeys.has(key))}
              {...props}
            />
          )}
        </section>
      )}
    </section>
  );
}
