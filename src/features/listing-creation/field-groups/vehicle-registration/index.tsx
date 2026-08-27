import { useEffect, useMemo, useRef, useState } from "react";

import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AttributeFields, useAllCategoryFilters } from "@/components/attribute-fields";
import { VEHICLE_WIZARD_MANAGED_KEYS } from "@/lib/vehicle/vehicle-lookup.types";
import { getMissingRequiredFilters, vehicleCategoryGroupFor } from "@/lib/category-filters";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";
import { matchBrandAndModelInTitle } from "@/lib/vehicle/vehicle-brand-match";
import { getCategoryIcon } from "@/lib/category-icons";
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
  hasErrors = false,
  ...props
}: {
  heading: string;
  sectionId: string;
  visibleKeys: readonly string[];
  allKeys: readonly string[];
  initialOpen?: boolean;
  hasErrors?: boolean;
} & Pick<
  WizardSharedProps,
  "categoryId" | "categories" | "attributes" | "onAttributesChange" | "attributesTouched"
>) {
  const [open, setOpen] = useState(initialOpen);

  const errorId = `${sectionId}-error`;
  const contentId = `${sectionId}-content`;

  return (
    <details
      open={open || hasErrors}
      onToggle={(event) => setOpen(event.currentTarget.open)}
      aria-labelledby={sectionId}
      className="rounded-xl border border-border"
    >
      <summary
        aria-controls={contentId}
        aria-describedby={hasErrors ? errorId : undefined}
        className="flex cursor-pointer list-none items-center justify-between gap-3 p-4 [&::-webkit-details-marker]:hidden"
      >
        <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1">
          <span id={sectionId} role="heading" aria-level={3} className="text-sm font-medium">
            {heading}
          </span>
          {hasErrors && (
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
          hiddenKeys={hiddenKeysForManualSection(allKeys, visibleKeys)}
          required
        />
      </div>
    </details>
  );
}

/** For registrerte kjøretøy dekker SVV-oppslaget resten av de tekniske
 * feltene selv (se confirmVehicleData) — men "Antall soveplasser"
 * (bobil/campingvogn) og "Fritatt for EU-kontroll" (tilhenger) er
 * påkrevde felt SVV aldri har data for, så de spørres i samme bekreftelse
 * som Merke/Modell. Disse to er de eneste feltene denne AttributeFields-
 * instansen skal rendre — alt annet skjules dynamisk (se
 * `hiddenKeysForRegisteredExtraSpecs` under) fremfor via en hardkodet
 * nøkkelliste, som tidligere ikke dekket alle SVV-utledede felt (f.eks.
 * årsmodell, førstegangsregistrering) og dermed spurte om dem på nytt. */
const VEHICLE_REGISTERED_REQUIRED_SPEC_KEYS = ["sleeping_places", "eu_control_exempt"];

/**
 * Første steg i kjøretøyflyten etter at kategorien er bekreftet:
 * registreringsnummer/oppslag alene for registrerte kjøretøy, eller manuell
 * merke-, modell- og teknisk registrering for uregistrerte kjøretøy.
 *
 * Merke/Modell forhåndsutfylles fra tittelen brukeren skrev på
 * landingsskjermen ("Porsche 911" → Porsche / 911, se
 * `matchBrandAndModelInTitle`). For registrerte kjøretøy vises feltene først
 * sammen med SVV-faktaene i bekreftelsen; uregistrerte kjøretøy fyller dem
 * manuelt på siden.
 *
 * Registreringsnummeret brukes kun til å hente *tekniske* data fra SVV.
 * Oppslaget kjøres fra wizardens "Neste"-knapp (se `goToNextPage` i
 * ny-annonse.tsx), ikke fra en egen knapp her — et norsk skilt har aldri mer
 * enn 7 tegn, så feltet er begrenset til det. Brukere som ikke har eller
 * ikke vil oppgi registreringsnummer krysser av boksen under skiltet og
 * fyller ut de tekniske opplysningene selv. Kategorivelgeren som lå i den
 * grenen tidligere er borte: kategorien er allerede bekreftet på steget før
 * dette.
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
    attributes,
    onAttributesChange,
    extraFieldError,
    bilOgMcCategoryId,
    onCategorySelect,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    confirmVehicleData,
    resetLookupOnReturnToRegistration,
  } = props;

  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const categoryGroup =
    vehicleCategoryGroupFor(categoryId || null, allFilters ?? [], categoriesById) ?? "bil";

  /** Skjuler alle kategoriens filtre bortsett fra de to som ikke kommer fra
   * SVV — bygget fra de faktiske filtrene i stedet for en hardkodet
   * nøkkelliste, slik at et nytt SVV-utledet felt (lagt til i
   * confirmVehicleData) automatisk forblir skjult her uten en samtidig
   * oppdatering to steder. */
  const hiddenKeysForRegisteredExtraSpecs = useMemo(
    () =>
      (allFilters ?? [])
        .map((f) => f.key)
        .filter((k) => !VEHICLE_REGISTERED_REQUIRED_SPEC_KEYS.includes(k)),
    [allFilters],
  );
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
    if (!props.attributesTouched) return new Set<string>();
    return new Set(
      getMissingRequiredFilters(
        categoryId,
        allFilters ?? [],
        categoriesById,
        attributes,
        HIDDEN_KEYS_FOR_MANUAL_SPECS,
      ).map((filter) => filter.key),
    );
  }, [props.attributesTouched, categoryId, allFilters, categoriesById, attributes]);
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
  const detectedSlug = vehicleClassification?.slug ?? null;
  /** Kategorien brukeren valgte i rutenettet over (før oppslaget) stemmer
   * ikke alltid med hva SVV faktisk finner på skiltet — vist som en
   * advarsel i bekreftelsespopupen under, ikke en egen dialog: "Nei" der
   * dekker begge tilfeller (feil skilt eller feil underkategori), siden
   * begge feltene er redigerbare på denne samme siden. */
  const categoryMismatch = !!lookup && !!detectedSlug && detectedSlug !== selectedLeafSlug;
  const lookupSummary = lookup
    ? [lookup.color, lookup.brand, lookup.model].filter(Boolean).join(" ")
    : "";
  const confirmedBrand = brand ?? lookup?.brand ?? undefined;
  const confirmedModel = brand === undefined ? (model ?? lookup?.model ?? undefined) : model;
  const registeredExtraSpecMissing =
    ((selectedLeafSlug === "bobil" || selectedLeafSlug === "campingvogn") &&
      (typeof attributes.sleeping_places !== "number" || !attributes.sleeping_places)) ||
    (selectedLeafSlug === "tilhenger-leaf" && attributes.eu_control_exempt == null);
  const lookupReadyToConfirm =
    !!confirmedBrand?.trim() && !!confirmedModel?.trim() && !registeredExtraSpecMissing;
  function formatRegNr(v: string) {
    const m = /^([A-Z]{2,3})(\d{3,5})$/.exec(v);
    return m ? `${m[1]} ${m[2]}` : v;
  }

  return (
    <section className="space-y-5">
      <div className="space-y-2">
        <Label>Underkategori</Label>
        <p className="text-xs text-muted-foreground">
          Merke og modell under filtreres etter hvilken underkategori som er valgt. Velg en annen
          hvis den markerte ikke stemmer.
        </p>
        <div
          role="radiogroup"
          aria-label="Underkategori"
          className="grid grid-cols-3 gap-2 sm:grid-cols-4"
        >
          {VEHICLE_LEAF_SLUGS.filter((slug) => leafBySlug.has(slug)).map((slug) => {
            const leaf = leafBySlug.get(slug)!;
            const Icon = getCategoryIcon(leaf.icon);
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
                <Icon className="size-5" />
                {LEAF_LABELS_NB[slug]}
              </button>
            );
          })}
        </div>
      </div>

      {!vehicleRegistered && (
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
          <ManualSpecSection
            heading="Grunnfakta"
            sectionId="vehicle-manual-grunnfakta-heading"
            visibleKeys={manualSections.grunnfakta}
            allKeys={manualSpecKeys}
            initialOpen
            hasErrors={manualSections.grunnfakta.some((key) => missingManualSpecKeys.has(key))}
            {...props}
          />
        </section>
      )}

      <div className="space-y-3 border-t pt-4">
        <Label htmlFor="vehicle-reg-nr">
          Registreringsnummer
          {vehicleRegistered && <RequiredMark />}
        </Label>

        {vehicleRegistered && (
          <>
            <p className="text-xs text-muted-foreground">
              Trykk Neste for å hente tekniske opplysninger automatisk fra Statens vegvesen. Du får
              sjekke og rette opplysningene før annonsen opprettes.
            </p>

            <div className="flex flex-wrap items-center gap-3">
              <div
                className={`flex h-20 w-72 items-stretch overflow-hidden rounded-lg bg-white shadow-md ${
                  vehicleLookupError ? "ring-2 ring-destructive" : ""
                }`}
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
                  onChange={(e) => setVehicleRegNrInput(e.target.value.toUpperCase().slice(0, 7))}
                  maxLength={7}
                  placeholder="AB 12345"
                  disabled={vehicleLookupLoading}
                  aria-required="true"
                  aria-invalid={!!vehicleLookupError}
                  aria-describedby={vehicleLookupError ? "vehicle-reg-nr-error" : undefined}
                  className="w-full flex-1 bg-white px-2 text-center font-mono text-4xl font-bold tracking-[0.08em] text-neutral-900 outline-none placeholder:text-black/20 disabled:opacity-60"
                  autoComplete="off"
                  autoCapitalize="characters"
                />
              </div>
            </div>
            {vehicleLookupLoading && (
              <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
                Slår opp kjøretøy…
              </p>
            )}
            {vehicleLookupError && (
              <p
                id="vehicle-reg-nr-error"
                role="alert"
                aria-live="assertive"
                className="text-sm text-destructive"
              >
                {vehicleLookupError}
              </p>
            )}
          </>
        )}

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
                hasErrors={manualSections.drivlinje.some((key) => missingManualSpecKeys.has(key))}
                {...props}
              />
              <ManualSpecSection
                heading="Praktiske opplysninger"
                sectionId="vehicle-manual-praktiske-heading"
                visibleKeys={manualSections.praktiske}
                allKeys={manualSpecKeys}
                hasErrors={manualSections.praktiske.some((key) => missingManualSpecKeys.has(key))}
                {...props}
              />
              <ManualSpecSection
                heading="Flere opplysninger"
                sectionId="vehicle-manual-flere-heading"
                visibleKeys={manualSections.flere}
                allKeys={manualSpecKeys}
                hasErrors={manualSections.flere.some((key) => missingManualSpecKeys.has(key))}
                {...props}
              />
            </div>
          </div>
        )}
      </div>
      <AlertDialog open={!!lookup} onOpenChange={() => {}}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Registreringsnummer {lookup && formatRegNr(lookup.registrationNumber)}
            </AlertDialogTitle>
            <AlertDialogDescription>
              Dette tilhører en {lookupSummary}
              {lookup?.year ? ` (${lookup.year}-modell)` : ""}. Er dette korrekt?
            </AlertDialogDescription>
            <p className="text-sm font-medium text-foreground">Kjøretøydata fra Statens vegvesen</p>
          </AlertDialogHeader>
          {categoryMismatch && (
            <Alert variant="warning">
              <AlertDescription>
                Registreringsnummeret matcher ikke valgt kategori: Statens vegvesen sier dette er en{" "}
                <span className="font-medium">{LEAF_LABELS_NB[detectedSlug]}</span>, men du har
                valgt <span className="font-medium">{LEAF_LABELS_NB[selectedLeafSlug]}</span> som
                underkategori. Trykk «Nei» for å endre underkategori eller registreringsnummer.
              </AlertDescription>
            </Alert>
          )}
          {vehiclePreviousClassificationMismatch && (
            <Alert variant="warning">
              <AlertDescription>
                Sist du slo opp dette registreringsnummeret fikk du en annen kjøretøytype — dette
                kan skje ved eierskifte av personlige kjennemerker. Sjekk at opplysningene over
                stemmer.
              </AlertDescription>
            </Alert>
          )}
          {lookup && (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Kontroller merke og modell. Rett bare hvis opplysningene fra Statens vegvesen ikke
                stemmer.
              </p>
              <p className="text-sm text-muted-foreground">
                Du kan rette merke og modell her. Hvis registreringsnummeret eller underkategorien
                er feil, trykk «Nei» for å gjøre oppslaget på nytt.
              </p>
              <VehicleBrandField
                categoryGroup={categoryGroup}
                value={confirmedBrand}
                onChange={(v) => setAttribute("brand", v)}
                required
              />
              <VehicleModelWithClassField
                categoryGroup={categoryGroup}
                brandName={confirmedBrand}
                value={confirmedModel}
                onChange={(v) => setAttribute("model", v)}
                required
              />
              <AttributeFields
                categoryId={categoryId}
                categories={categories}
                value={attributes}
                onChange={onAttributesChange}
                showErrors
                hiddenKeys={hiddenKeysForRegisteredExtraSpecs}
                required
              />
              {!lookupReadyToConfirm && (
                <p className="text-sm text-destructive">
                  Fyll inn alle påkrevde opplysninger før du fortsetter.
                </p>
              )}
            </div>
          )}
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => resetLookupOnReturnToRegistration()}>
              Nei
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!lookupReadyToConfirm}
              onClick={() => confirmVehicleData(categoryId)}
            >
              Ja
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
