import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { showErrorToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import {
  vehicleCategoryGroupFor,
  type CategoryFilter,
  type CategoryNode,
} from "@/lib/category-filters";
import { lookupVehicleByRegNumber } from "@/lib/vehicle/vehicle-lookup.functions";
import { matchVehicleBrandModel } from "@/lib/vehicle/vehicle-brand-match.functions";
import { classifyVehicleCategory } from "@/lib/vehicle/vehicle-classification";
import type {
  AvgiftskodeGruppe,
  VehicleClassification,
} from "@/lib/vehicle/vehicle-classification";
import type { VehicleLookupResult } from "@/lib/vehicle/vehicle-lookup.server";
import type { AttributeMap } from "@/components/attribute-fields";

type VehicleSpecOverrides = Partial<{
  year: number;
  fuel_type: string;
  transmission: string;
  drive_type: string;
  weight_kg: number;
  power_hk: number;
  tow_hitch: boolean;
  max_tow_weight_kg: number;
  seats: number;
  color: string;
  next_eu_control: string;
  eu_control_exempt: boolean;
  sleeping_places: number;
  max_total_weight_kg: number;
  length_m: number;
  imported_used: boolean;
  first_registration_date: string;
  cylinders: number;
  engine_displacement_cc: number;
  engine_code: string;
  avgiftskode_gruppe: AvgiftskodeGruppe;
}>;

type CategoriesById = Map<string, CategoryNode & { name_nb: string; slug?: string }>;

/**
 * Owns the "Bil og MC" registration-number lookup flow: running the SVV
 * lookup, classifying the result, matching brand/model against a chosen leaf
 * category, and committing the resolved spec into the listing's attributes.
 * Pulled out of ny-annonse.tsx, which mixed this with every other wizard
 * concern in one component — see also useDraftAutosave for the same pattern.
 */
export function useVehicleLookupFlow(params: {
  allFilters: CategoryFilter[] | undefined;
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
    allFilters,
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
  const [vehicleLookupConfirmOpen, setVehicleLookupConfirmOpen] = useState(false);
  /** DOM node for the shared step footer's primary-action slot, on the
   * vehicle-confirm page — lets VehicleConfirm portal its "Bekreft og
   * fortsett" button there instead of rendering it inline, so it sits on the
   * same row as "Tilbake" like every other step's primary action. */
  const [vehicleConfirmFooterSlot, setVehicleConfirmFooterSlot] = useState<HTMLDivElement | null>(
    null,
  );
  const [vehicleRegNrInput, setVehicleRegNrInput] = useState("");
  const lookupVehicleFn = useServerFn(lookupVehicleByRegNumber);
  const matchBrandModelFn = useServerFn(matchVehicleBrandModel);

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
      setVehicleLookupConfirmOpen(true);
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

  /** Runs the deferred brand/model match for a chosen leaf category, so
   * vehicle-confirm can show/resolve an unmatched brand or model to the user
   * *before* they commit — rather than confirmVehicleData silently leaving
   * brand/model unset. */
  async function matchVehicleBrandForLeaf(leafCategoryId: string) {
    const lookup = vehicleLookupResult;
    if (!lookup) return null;
    const categoryGroup = vehicleCategoryGroupFor(leafCategoryId, allFilters ?? [], categoriesById);
    if (!categoryGroup) return null;
    const { brandMatch, modelMatch } = await matchBrandModelFn({
      data: { brand: lookup.brand, model: lookup.model, categoryGroup },
    });
    return { categoryGroup, brandMatch, modelMatch };
  }

  function confirmVehicleData(
    leafCategoryId: string,
    resolved?: { brandName?: string; modelName?: string; specOverrides?: VehicleSpecOverrides },
  ) {
    const lookup = vehicleLookupResult;
    if (!lookup) return;
    const spec = resolved?.specOverrides;

    const next: AttributeMap = {
      ...attributes,
      is_registered: true,
      registration_number: lookup.registrationNumber,
      vehicle_lookup: JSON.stringify(lookup),
    };
    const year = spec?.year ?? lookup.year;
    if (year) next.year = year;
    const fuelType = spec?.fuel_type ?? lookup.fuel_type;
    if (fuelType) next.fuel_type = fuelType;
    const weightKg = spec?.weight_kg ?? lookup.weight_kg;
    if (weightKg != null) next.weight_kg = weightKg;
    const transmission = spec?.transmission ?? lookup.transmission;
    if (transmission) next.transmission = transmission;
    const color = spec?.color ?? lookup.color;
    if (color) next.color = color;
    const nextEuControl = spec?.next_eu_control ?? lookup.next_eu_control;
    if (nextEuControl) next.next_eu_control = nextEuControl;
    if (spec?.eu_control_exempt != null) next.eu_control_exempt = spec.eu_control_exempt;
    const powerHk = spec?.power_hk ?? lookup.power_hk;
    if (powerHk != null) next.power_hk = powerHk;
    const driveType = spec?.drive_type ?? lookup.drive_type;
    if (driveType) next.drive_type = driveType;
    const towHitch = spec?.tow_hitch ?? lookup.tow_hitch;
    if (towHitch != null) next.tow_hitch = towHitch;
    const maxTowWeightKg = spec?.max_tow_weight_kg ?? lookup.max_tow_weight_kg;
    if (maxTowWeightKg != null) next.max_tow_weight_kg = maxTowWeightKg;
    const maxTotalWeightKg = spec?.max_total_weight_kg ?? lookup.max_total_weight_kg;
    if (maxTotalWeightKg != null) next.max_total_weight_kg = maxTotalWeightKg;
    const lengthM = spec?.length_m ?? lookup.length_m;
    if (lengthM != null) next.length_m = lengthM;
    const seats = spec?.seats ?? lookup.seats;
    if (seats != null) next.seats = seats;
    const importedUsed = spec?.imported_used ?? lookup.imported_used;
    if (importedUsed != null) next.imported_used = importedUsed;
    const firstRegistrationDate = spec?.first_registration_date ?? lookup.first_registration_date;
    if (firstRegistrationDate) next.first_registration_date = firstRegistrationDate;
    const cylinders = spec?.cylinders ?? lookup.cylinders;
    if (cylinders != null) next.cylinders = cylinders;
    const engineDisplacementCc = spec?.engine_displacement_cc ?? lookup.engine_displacement_cc;
    if (engineDisplacementCc != null) next.engine_displacement_cc = engineDisplacementCc;
    const engineCode = spec?.engine_code ?? lookup.engine_code;
    if (engineCode) next.engine_code = engineCode;
    const sleepingPlaces = spec?.sleeping_places ?? lookup.sleeping_places;
    if (sleepingPlaces != null) next.sleeping_places = sleepingPlaces;
    // Personbil/Varebil-gruppen (utledet i vehicle-confirm fra avgiftsklasse-
    // koden) manglet her tidligere — den ble beregnet og sendt med i
    // specOverrides, men aldri faktisk skrevet til attributes, så
    // omregistreringsavgiften kunne aldri beregnes for noen "bil"-annonse
    // (alltid "Vi klarte ikke å beregne avgiften automatisk", uansett hvor
    // komplett SVV-dataen var — se bug-rapport for DR50500, en Audi A3
    // e-tron med fullstendige data).
    if (spec?.avgiftskode_gruppe) next.avgiftskode_gruppe = spec.avgiftskode_gruppe;
    if (resolved?.brandName) next.brand = resolved.brandName;
    if (resolved?.modelName) next.model = resolved.modelName;

    setAttributes(next);
    setCategoryTouchedManually(true);
    setSelectedParentId(categoriesById.get(leafCategoryId)?.parent_id ?? leafCategoryId);
    setValue("category_id", leafCategoryId, { shouldValidate: true });
    // Går rett til neste steg i stedet for å kalle goToNextPage(), siden den
    // ville revalidert vehicle-confirm-steget med en categoryId som ennå ikke
    // har rukket å oppdateres i state — og dermed feilaktig blokkert
    // fremgangen på første klikk (måtte klikkes to ganger for å virke).
    goNext();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  /** Called from the post-lookup confirm overlay's "Juster registreringsnummer"
   * action: clears the lookup so the user can retype and re-search, without
   * touching vehicleRegistered or navigating away from the current step. */
  function adjustVehicleRegistrationNumber() {
    setVehicleLookupConfirmOpen(false);
    setVehicleLookupResult(null);
    setVehicleClassification(null);
    setVehicleLookupError(null);
    setVehiclePreviousClassificationMismatch(null);
  }

  /** Stepping back from vehicle-confirm to vehicle-registration (via
   * "Tilbake") is the only way to reach vehicle-registration a second time —
   * clear the stale lookup so the reg-nr field is editable again and
   * pressing "Neste" re-runs the lookup instead of bouncing straight back to
   * vehicle-confirm with old data. */
  function resetLookupOnReturnToRegistration() {
    setVehicleLookupResult(null);
    setVehicleClassification(null);
    setVehicleLookupError(null);
    setVehiclePreviousClassificationMismatch(null);
    setVehicleLookupConfirmOpen(false);
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
    vehicleLookupConfirmOpen,
    setVehicleLookupConfirmOpen,
    vehicleConfirmFooterSlot,
    setVehicleConfirmFooterSlot,
    vehicleRegNrInput,
    setVehicleRegNrInput,
    runVehicleLookup,
    matchVehicleBrandForLeaf,
    confirmVehicleData,
    adjustVehicleRegistrationNumber,
    resetLookupOnReturnToRegistration,
    showMissingRegNrError,
  };
}
