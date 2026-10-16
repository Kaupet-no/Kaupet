import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import type { CategoryNode, VehicleBrandGroup } from "@/lib/category-filters";
import { lookupVehicleByRegNumber } from "@/lib/vehicle/vehicle-lookup.functions";
import { createVehicleBrand, createVehicleModel } from "@/lib/vehicle/vehicle-brands.functions";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";
import {
  classifyVehicleCategory,
  avgiftskodeGruppeFromCode,
} from "@/lib/vehicle/vehicle-classification";
import { firstRegistrationYear } from "@/lib/vehicle/first-registration";
import type { VehicleClassification } from "@/lib/vehicle/vehicle-classification";
import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.types";
import { isValidVehicleRegistrationNumber } from "@/lib/vehicle/vehicle-registration";
import { euControlStatusFromLookup } from "@/lib/vehicle/vehicle-options";
import type { AttributeMap } from "@/components/attribute-fields";

/** Attributtene et kjøretøyoppslag fyller, med verdien fra `lookup` eller
 * `undefined` der oppslaget mangler den. Nøklene er de samme uansett oppslag,
 * så de er også listen som tømmes ved nytt kjennemerke: et nytt felt her
 * ryddes automatisk (KG-20-F01). Merke/modell fra SVV brukes bare når
 * oppslaget har begge; ellers fyller brukeren dem inn selv. */
function vehicleLookupAttributes(
  lookup: VehicleLookupResult,
): Record<string, AttributeMap[string] | undefined> {
  const hasBrandAndModel = !!lookup.brand && !!lookup.model;
  // Den eksakte datoen vises på annonsesiden, men søkes på som år — så året
  // lagres avledet ved siden av (se
  // 20260729130000_first_registration_year_numeric.sql).
  const firstRegistrationDate = lookup.first_registration_date || undefined;
  return {
    brand: (hasBrandAndModel && lookup.brand) || undefined,
    model: (hasBrandAndModel && lookup.model) || undefined,
    year: lookup.year || undefined,
    fuel_type: lookup.fuel_type || undefined,
    weight_kg: lookup.weight_kg ?? undefined,
    transmission: lookup.transmission || undefined,
    color: guessColorOption(lookup.color) ?? undefined,
    body_type: lookup.body_type || undefined,
    next_eu_control: lookup.next_eu_control || undefined,
    eu_control_status: euControlStatusFromLookup(lookup) ?? undefined,
    power_hk: lookup.power_hk ?? undefined,
    drive_type: lookup.drive_type || undefined,
    tow_hitch: lookup.tow_hitch ?? undefined,
    max_tow_weight_kg: lookup.max_tow_weight_kg ?? undefined,
    max_total_weight_kg: lookup.max_total_weight_kg ?? undefined,
    length_m: lookup.length_m ?? undefined,
    seats: lookup.seats ?? undefined,
    imported_used: lookup.imported_used ?? undefined,
    first_registration_date: firstRegistrationDate,
    first_registration_year: firstRegistrationDate
      ? (firstRegistrationYear(firstRegistrationDate) ?? undefined)
      : undefined,
    cylinders: lookup.cylinders ?? undefined,
    engine_displacement_cc: lookup.engine_displacement_cc ?? undefined,
    engine_code: lookup.engine_code || undefined,
    sleeping_places: lookup.sleeping_places ?? undefined,
    // Personbil/Varebil-gruppen, utledet automatisk fra avgiftsklassekoden —
    // uten denne kan ikke omregistreringsavgiften beregnes (se bug-rapport
    // for DR50500, en Audi A3 e-tron med fullstendige data der denne manglet).
    avgiftskode_gruppe:
      avgiftskodeGruppeFromCode(lookup.avgiftsklasse_code, lookup.classification_code) ?? undefined,
  };
}

/** Legger rå SVV-data inn i attributes. Ved et nytt kjennemerke fjernes
 * forrige oppslags felt først, så kjøretøy B ikke arver A sine data der B
 * mangler en verdi. Andre felt beholdes. Delt av veiviseren og
 * skiltdialogen. */
export function applyVehicleLookup(
  attributes: AttributeMap,
  lookup: VehicleLookupResult,
): AttributeMap {
  const next: AttributeMap = { ...attributes };
  const fromLookup = vehicleLookupAttributes(lookup);
  if (attributes.vehicle_lookup && attributes.registration_number !== lookup.registrationNumber) {
    for (const key of Object.keys(fromLookup)) delete next[key];
  }
  next.is_registered = true;
  next.registration_number = lookup.registrationNumber;
  next.vehicle_lookup = JSON.stringify(lookup);
  for (const [key, value] of Object.entries(fromLookup)) {
    // Et EU-valg brukeren alt har gjort for dette kjennemerket (også eldre
    // klienters eu_control_exempt) overstyres ikke.
    if (key === "eu_control_status" && (next[key] || next.eu_control_exempt === true)) continue;
    if (value !== undefined) next[key] = value;
  }
  return next;
}

type CategoriesById = Map<string, CategoryNode & { name_nb: string; slug?: string }>;

/** SVV returns color as free text (e.g. "SORT", "SØLV METALLIC") — best-effort
 * maps it onto the fixed color list so it matches the "manual entry" path's
 * fixed values (used for display/filtering) instead of storing raw text that
 * wouldn't match any of them. */
function guessColorOption(raw: string | null | undefined): string | undefined {
  if (!raw) return undefined;
  const s = raw.toLowerCase();
  const matchers: [string, string[]][] = [
    ["black", ["sort", "svart"]],
    ["white", ["hvit"]],
    ["silver", ["sølv", "solv"]],
    ["gray", ["grå", "gra"]],
    ["red", ["rød", "rod"]],
    ["blue", ["blå", "bla"]],
    ["green", ["grønn", "gronn"]],
    ["yellow", ["gul"]],
    ["orange", ["oransje"]],
    ["brown", ["brun"]],
    ["beige", ["beige"]],
    ["purple", ["lilla", "fiolett"]],
  ];
  for (const [value, keywords] of matchers) {
    if (keywords.some((k) => s.includes(k))) return value;
  }
  return "other";
}

/**
 * Owns the "Bil og MC" registration-number lookup flow: running the SVV
 * lookup, classifying the result, matching brand/model against a chosen leaf
 * category, and committing the resolved spec into the listing's attributes.
 * Pulled out of ny-annonse.tsx, which mixed this with every other wizard
 * concern in one component — see also useDraftAutosave for the same pattern.
 */
export function useVehicleLookupFlow(params: {
  categoriesById: CategoriesById;
  attributes: AttributeMap;
  setAttributes: (next: AttributeMap) => void;
  setCategoryTouchedManually: (touched: boolean) => void;
  setSelectedParentId: (id: string) => void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
  goNext: () => void;
}) {
  const {
    categoriesById,
    attributes,
    setAttributes,
    setCategoryTouchedManually,
    setSelectedParentId,
    setValue,
    goNext,
  } = params;

  const vehicleRegistered = attributes.is_registered !== false;
  const setVehicleRegistered = (registered: boolean) => {
    setAttributes({ ...attributes, is_registered: registered });
  };
  const [vehicleLookupLoading, setVehicleLookupLoading] = useState(false);
  const [vehicleLookupError, setVehicleLookupError] = useState<string | null>(null);
  const [vehicleLookupResult, setVehicleLookupResult] = useState<VehicleLookupResult | null>(null);
  const [vehicleClassification, setVehicleClassification] = useState<VehicleClassification | null>(
    null,
  );
  const [vehiclePreviousClassificationMismatch, setVehiclePreviousClassificationMismatch] =
    useState<{ slug: string | null; lookedUpAt: string } | null>(null);
  const [vehicleRegNrInput, setVehicleRegNrInput] = useState("");
  const lookupVehicleFn = useServerFn(lookupVehicleByRegNumber);
  const qc = useQueryClient();
  const createBrandFn = useServerFn(createVehicleBrand);
  const createModelFn = useServerFn(createVehicleModel);
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();

  /** Best-effort: registers a brand/model Statens vegvesen returned but that
   * isn't in Kaupet's approved catalog yet, so it lands in the admin
   * moderation queue (see VehicleBrandsTab) instead of silently vanishing.
   * Fire-and-forget from the caller — never blocks listing creation, since
   * the user's own listing already has the free-text value in
   * attributes.brand/.model regardless of whether this registration
   * succeeds (see createVehicleBrand/createVehicleModel's docstrings). */
  async function proposeUnknownVehicle(
    categoryGroup: VehicleBrandGroup,
    brandName: string,
    modelName: string | undefined,
  ) {
    try {
      const knownBrand = allBrands?.find(
        (b) =>
          b.category_group === categoryGroup && b.name.toLowerCase() === brandName.toLowerCase(),
      );
      let brandId = knownBrand?.id;
      if (!brandId) {
        const created = await createBrandFn({ data: { name: brandName, categoryGroup } });
        brandId = created.id;
      }
      if (modelName && brandId) {
        const knownModel = allModels?.find(
          (m) => m.brand_id === brandId && m.name.toLowerCase() === modelName.toLowerCase(),
        );
        if (!knownModel) {
          await createModelFn({ data: { brandId, name: modelName } });
        }
      }
      qc.invalidateQueries({ queryKey: ["vehicle-brands", "all"] });
      qc.invalidateQueries({ queryKey: ["vehicle-models", "all"] });
    } catch {
      // Best effort — a failed proposal must never block listing creation.
    }
  }

  async function runVehicleLookup(registrationNumber: string): Promise<boolean> {
    setVehicleLookupError(null);
    if (!isValidVehicleRegistrationNumber(registrationNumber)) {
      setVehicleLookupError("Skriv inn et gyldig registreringsnummer.");
      return false;
    }
    setVehicleLookupLoading(true);
    try {
      const { lookup, previousClassificationMismatch } = await lookupVehicleFn({
        data: { registrationNumber },
      });
      setVehicleLookupResult(lookup);
      setVehicleClassification(
        classifyVehicleCategory(
          lookup.classification_code,
          lookup.avgiftsklasse_code,
          lookup.body_type_hint,
          lookup.sleeping_places,
        ),
      );
      setVehiclePreviousClassificationMismatch(previousClassificationMismatch);
      return true;
    } catch (e) {
      setVehicleLookupError(
        formatErrorMessage(
          e,
          "Kjøretøyoppslag feilet. Kontroller at du har skrevet riktig og prøv igjen.",
        ),
      );
      return false;
    } finally {
      setVehicleLookupLoading(false);
    }
  }

  /** Skriver rå SVV-data til attributes (applyVehicleLookup) når brukeren
   * går videre fra vehicle-registration.
   * `categoryGroup` avgjør hvilken merke-/modelltabell et ukjent merke/modell
   * (fra SVV) foreslås inn i — se proposeUnknownVehicle over. */
  function confirmVehicleData(leafCategoryId: string, categoryGroup: VehicleBrandGroup) {
    const lookup = vehicleLookupResult;
    if (!lookup) return;

    const next = applyVehicleLookup(attributes, lookup);
    if (typeof next.brand === "string" && next.brand.trim()) {
      void proposeUnknownVehicle(
        categoryGroup,
        next.brand,
        typeof next.model === "string" && next.model.trim() ? next.model : undefined,
      );
    }

    setAttributes(next);
    setCategoryTouchedManually(true);
    setSelectedParentId(categoriesById.get(leafCategoryId)?.parent_id ?? leafCategoryId);
    setValue("category_id", leafCategoryId, { shouldValidate: true });
    // Går rett til neste steg i stedet for å kalle goToNextPage(), siden den
    // ville revalidert vehicle-confirm-steget med en categoryId som ennå ikke
    // har rukket å oppdateres i state — og dermed feilaktig blokkert
    // fremgangen på første klikk (måtte klikkes to ganger for å virke).
    goNext();
    window.scrollTo({ top: 0 });
  }

  /** Clears the lookup so the user can retype and re-search, without
   * touching vehicleRegistered or navigating away from the current step.
   * Brukes av kjennemerke-dialogen i redigeringsflyten
   * (vehicle-plate-edit-dialog.tsx). */
  function adjustVehicleRegistrationNumber() {
    setVehicleLookupResult(null);
    setVehicleClassification(null);
    setVehicleLookupError(null);
    setVehiclePreviousClassificationMismatch(null);
  }

  /** Clears the lookup so "Bekreft"/"Neste" re-runs it — used when the user
   * edits the registration number after a lookup, which makes the old
   * result (and the subcategory picked from it) stale. */
  function resetLookupOnReturnToRegistration() {
    setVehicleLookupResult(null);
    setVehicleClassification(null);
    setVehicleLookupError(null);
    setVehiclePreviousClassificationMismatch(null);
  }

  function showMissingRegNrError() {
    showErrorToast("Skriv inn registreringsnummer.");
  }

  return {
    vehicleRegistered,
    setVehicleRegistered,
    vehicleLookupLoading,
    vehicleLookupError,
    vehicleLookupResult,
    vehicleClassification,
    vehiclePreviousClassificationMismatch,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    confirmVehicleData,
    adjustVehicleRegistrationNumber,
    resetLookupOnReturnToRegistration,
    showMissingRegNrError,
  };
}
