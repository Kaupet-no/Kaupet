import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import type { CategoryNode } from "@/lib/category-filters";
import { lookupVehicleByRegNumber } from "@/lib/vehicle/vehicle-lookup.functions";
import {
  classifyVehicleCategory,
  avgiftskodeGruppeFromCode,
} from "@/lib/vehicle/vehicle-classification";
import { firstRegistrationYear } from "@/lib/vehicle/first-registration";
import type { VehicleClassification } from "@/lib/vehicle/vehicle-classification";
import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.types";
import type { AttributeMap } from "@/components/attribute-fields";

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

  const [vehicleRegistered, setVehicleRegistered] = useState(true);
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

  async function runVehicleLookup(registrationNumber: string): Promise<boolean> {
    setVehicleLookupLoading(true);
    setVehicleLookupError(null);
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

  /** Skriver rå SVV-data til attributes etter at brukeren har kontrollert
   * merke/modell i vehicle-registration-popupen. Eksisterende korreksjoner
   * vinner; ellers brukes oppslagsverdiene uten en ekstra registreringsrunde. */
  function confirmVehicleData(leafCategoryId: string) {
    const lookup = vehicleLookupResult;
    if (!lookup) return;

    const next: AttributeMap = {
      ...attributes,
      is_registered: true,
      registration_number: lookup.registrationNumber,
      vehicle_lookup: JSON.stringify(lookup),
    };
    if (!(typeof next.brand === "string" && next.brand.trim()) && lookup.brand) {
      next.brand = lookup.brand;
    }
    if (!(typeof next.model === "string" && next.model.trim()) && lookup.model) {
      next.model = lookup.model;
    }
    if (lookup.year) next.year = lookup.year;
    if (lookup.fuel_type) next.fuel_type = lookup.fuel_type;
    if (lookup.weight_kg != null) next.weight_kg = lookup.weight_kg;
    if (lookup.transmission) next.transmission = lookup.transmission;
    const color = guessColorOption(lookup.color);
    if (color) next.color = color;
    if (lookup.next_eu_control) next.next_eu_control = lookup.next_eu_control;
    if (lookup.power_hk != null) next.power_hk = lookup.power_hk;
    if (lookup.drive_type) next.drive_type = lookup.drive_type;
    if (lookup.tow_hitch != null) next.tow_hitch = lookup.tow_hitch;
    if (lookup.max_tow_weight_kg != null) next.max_tow_weight_kg = lookup.max_tow_weight_kg;
    if (lookup.max_total_weight_kg != null) next.max_total_weight_kg = lookup.max_total_weight_kg;
    if (lookup.length_m != null) next.length_m = lookup.length_m;
    if (lookup.seats != null) next.seats = lookup.seats;
    if (lookup.imported_used != null) next.imported_used = lookup.imported_used;
    if (lookup.first_registration_date) {
      next.first_registration_date = lookup.first_registration_date;
      // Den eksakte datoen vises på annonsesiden, men søkes på som år — så
      // året lagres avledet ved siden av (se
      // 20260729130000_first_registration_year_numeric.sql).
      const year = firstRegistrationYear(lookup.first_registration_date);
      if (year != null) next.first_registration_year = year;
    }
    if (lookup.cylinders != null) next.cylinders = lookup.cylinders;
    if (lookup.engine_displacement_cc != null)
      next.engine_displacement_cc = lookup.engine_displacement_cc;
    if (lookup.engine_code) next.engine_code = lookup.engine_code;
    if (lookup.sleeping_places != null) next.sleeping_places = lookup.sleeping_places;
    // Personbil/Varebil-gruppen, utledet automatisk fra avgiftsklassekoden —
    // uten denne kan ikke omregistreringsavgiften beregnes (se bug-rapport
    // for DR50500, en Audi A3 e-tron med fullstendige data der denne manglet).
    const avgiftskodeGruppe = avgiftskodeGruppeFromCode(
      lookup.avgiftsklasse_code,
      lookup.classification_code,
    );
    if (avgiftskodeGruppe) next.avgiftskode_gruppe = avgiftskodeGruppe;

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

  /** Clears the lookup so the reg-nr field is editable again and pressing
   * "Neste" re-runs the lookup — used both when stepping back from a later
   * page to vehicle-registration, and when the user answers "Nei" to the
   * reg-nr confirmation popup shown right after a successful lookup. */
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
