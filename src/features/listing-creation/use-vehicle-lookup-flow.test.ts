// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useVehicleLookupFlow } from "./use-vehicle-lookup-flow";

vi.mock("@tanstack/react-start", () => ({
  // The hook's tests call runVehicleLookup directly, so useServerFn just
  // needs to hand back a callable that forwards to the mocked
  // implementation below.
  useServerFn: (fn: unknown) => fn,
}));

const lookupVehicleByRegNumberMock = vi.fn();
vi.mock("@/lib/vehicle/vehicle-lookup.functions", () => ({
  lookupVehicleByRegNumber: (...args: unknown[]) => lookupVehicleByRegNumberMock(...args),
}));

const createVehicleBrandMock = vi.fn();
const createVehicleModelMock = vi.fn();
vi.mock("@/lib/vehicle/vehicle-brands.functions", () => ({
  createVehicleBrand: (...args: unknown[]) => createVehicleBrandMock(...args),
  createVehicleModel: (...args: unknown[]) => createVehicleModelMock(...args),
}));

const useAllVehicleBrandsMock = vi.fn();
const useAllVehicleModelsMock = vi.fn();
vi.mock("@/lib/vehicle/vehicle-brands", () => ({
  useAllVehicleBrands: () => useAllVehicleBrandsMock(),
  useAllVehicleModels: () => useAllVehicleModelsMock(),
}));

const invalidateQueriesMock = vi.fn();
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: invalidateQueriesMock }),
}));

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
}));

const CAR_CATEGORY_ID = "car-leaf-id";

function makeParams(overrides?: Partial<Parameters<typeof useVehicleLookupFlow>[0]>) {
  return {
    categoriesById: new Map([
      [CAR_CATEGORY_ID, { id: CAR_CATEGORY_ID, parent_id: "cars-root", name_nb: "Bil" }],
    ]),
    attributes: {},
    setAttributes: vi.fn(),
    setCategoryTouchedManually: vi.fn(),
    setSelectedParentId: vi.fn(),
    setValue: vi.fn(),
    goNext: vi.fn(),
    ...overrides,
  };
}

const lookupResult = {
  registrationNumber: "EK12345",
  brand: "Toyota",
  model: "Corolla",
  year: 2020,
  classification_code: "M1",
  avgiftsklasse_code: "1",
  body_type_hint: null,
  body_type: "varebil",
  sleeping_places: null,
  fuel_type: "Bensin",
  weight_kg: 1300,
  transmission: null,
  color: "Blå",
  next_eu_control: null,
  eu_control_exempt: null,
  power_hk: 120,
  drive_type: null,
  axle_count: null,
  tow_hitch: null,
  max_tow_weight_kg: null,
  max_total_weight_kg: null,
  length_m: null,
  seats: 5,
  imported_used: false,
  first_registration_date: null,
  cylinders: null,
  engine_displacement_cc: null,
  engine_code: null,
};

beforeEach(() => {
  lookupVehicleByRegNumberMock.mockReset();
  createVehicleBrandMock
    .mockReset()
    .mockResolvedValue({ id: "brand-1", name: "x", status: "pending" });
  createVehicleModelMock
    .mockReset()
    .mockResolvedValue({ id: "model-1", name: "y", status: "pending" });
  useAllVehicleBrandsMock.mockReset().mockReturnValue({ data: [] });
  useAllVehicleModelsMock.mockReset().mockReturnValue({ data: [] });
  invalidateQueriesMock.mockReset();
});

describe("useVehicleLookupFlow", () => {
  it("starts with vehicleRegistered true and no lookup result", () => {
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams()));

    expect(result.current.vehicleRegistered).toBe(true);
    expect(result.current.vehicleLookupResult).toBeNull();
    expect(result.current.vehicleLookupError).toBeNull();
  });

  it("runVehicleLookup stores the result on success", async () => {
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: lookupResult,
      previousClassificationMismatch: null,
    });
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams()));

    const ok = await act(() => result.current.runVehicleLookup("EK12345"));

    expect(ok).toBe(true);
    expect(result.current.vehicleLookupResult).toEqual(lookupResult);
    expect(result.current.vehicleLookupLoading).toBe(false);
    expect(result.current.vehicleLookupError).toBeNull();
  });

  it("runVehicleLookup surfaces an error message and clears loading on failure", async () => {
    lookupVehicleByRegNumberMock.mockRejectedValue(new Error("SVV unavailable"));
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams()));

    const ok = await act(() => result.current.runVehicleLookup("EK12345"));

    expect(ok).toBe(false);
    expect(result.current.vehicleLookupResult).toBeNull();
    expect(result.current.vehicleLookupLoading).toBe(false);
    // formatErrorMessage passes a plain Error's own message through as-is
    // (it only substitutes the fallback for network/technical/JSON-looking
    // errors), so this is the actual message, not the fallback text.
    expect(result.current.vehicleLookupError).toBe("SVV unavailable");
  });

  it("confirmVehicleData is a no-op without a prior lookup result", () => {
    const setAttributes = vi.fn();
    const goNext = vi.fn();
    const { result } = renderHook(() =>
      useVehicleLookupFlow(makeParams({ setAttributes, goNext })),
    );

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    expect(setAttributes).not.toHaveBeenCalled();
    expect(goNext).not.toHaveBeenCalled();
  });

  it("confirmVehicleData reuses looked-up brand and model without a second registration", async () => {
    // jsdom doesn't implement scrollTo — stub it so confirmVehicleData's
    // window.scrollTo call doesn't throw.
    window.scrollTo = vi.fn();
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: lookupResult,
      previousClassificationMismatch: null,
    });
    const setAttributes = vi.fn();
    const setCategoryTouchedManually = vi.fn();
    const setSelectedParentId = vi.fn();
    const setValue = vi.fn();
    const goNext = vi.fn();
    const { result } = renderHook(() =>
      useVehicleLookupFlow(
        makeParams({
          attributes: { existing_key: "kept" },
          setAttributes,
          setCategoryTouchedManually,
          setSelectedParentId,
          setValue,
          goNext,
        }),
      ),
    );
    await act(() => result.current.runVehicleLookup("EK12345"));

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        existing_key: "kept",
        is_registered: true,
        registration_number: "EK12345",
        brand: "Toyota",
        model: "Corolla",
        fuel_type: "Bensin",
        weight_kg: 1300,
        body_type: "varebil",
        imported_used: false,
      }),
    );
    expect(setCategoryTouchedManually).toHaveBeenCalledWith(true);
    // categoriesById maps the leaf to parent_id "cars-root"
    expect(setSelectedParentId).toHaveBeenCalledWith("cars-root");
    expect(setValue).toHaveBeenCalledWith("category_id", CAR_CATEGORY_ID, { shouldValidate: true });
    expect(goNext).toHaveBeenCalled();
  });

  it("confirmVehicleData lagrer 0 som hengervekt når oppslaget bekrefter manglende hengerfeste", async () => {
    window.scrollTo = vi.fn();
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: { ...lookupResult, tow_hitch: false, max_tow_weight_kg: 0 },
      previousClassificationMismatch: null,
    });
    const setAttributes = vi.fn();
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams({ setAttributes })));
    await act(() => result.current.runVehicleLookup("EK12345"));

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({ tow_hitch: false, max_tow_weight_kg: 0 }),
    );
  });

  it("confirmVehicleData stores both the exact first-registration date and the searchable year", async () => {
    window.scrollTo = vi.fn();
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: { ...lookupResult, first_registration_date: "2018-05-14" },
      previousClassificationMismatch: null,
    });
    const setAttributes = vi.fn();
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams({ setAttributes })));
    await act(() => result.current.runVehicleLookup("EK12345"));

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    expect(setAttributes).toHaveBeenCalledWith(
      expect.objectContaining({
        first_registration_date: "2018-05-14",
        first_registration_year: 2018,
      }),
    );
  });

  it("adjustVehicleRegistrationNumber and resetLookupOnReturnToRegistration both clear the lookup state", async () => {
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: lookupResult,
      previousClassificationMismatch: null,
    });
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams()));
    await act(() => result.current.runVehicleLookup("EK12345"));
    expect(result.current.vehicleLookupResult).not.toBeNull();

    act(() => result.current.adjustVehicleRegistrationNumber());

    expect(result.current.vehicleLookupResult).toBeNull();

    // Re-run to also cover resetLookupOnReturnToRegistration.
    await act(() => result.current.runVehicleLookup("EK12345"));
    act(() => result.current.resetLookupOnReturnToRegistration());

    expect(result.current.vehicleLookupResult).toBeNull();
    expect(result.current.vehicleClassification).toBeNull();
  });

  it("confirmVehicleData proposes an unknown brand/model to the admin queue", async () => {
    window.scrollTo = vi.fn();
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: lookupResult,
      previousClassificationMismatch: null,
    });
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams()));
    await act(() => result.current.runVehicleLookup("EK12345"));

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    // createBrandFn is invoked synchronously (the mock records the call
    // before its promise resolves); createModelFn only runs after that
    // promise resolves with the new brand id, so it needs waitFor.
    expect(createVehicleBrandMock).toHaveBeenCalledWith({
      data: { name: "Toyota", categoryGroup: "bil" },
    });
    await waitFor(() => {
      expect(createVehicleModelMock).toHaveBeenCalledWith({
        data: { brandId: "brand-1", name: "Corolla" },
      });
    });
    await waitFor(() => {
      expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["vehicle-models", "all"] });
    });
    expect(invalidateQueriesMock).toHaveBeenCalledWith({ queryKey: ["vehicle-brands", "all"] });
  });

  it("confirmVehicleData does not propose a brand/model already in the catalog", async () => {
    window.scrollTo = vi.fn();
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: lookupResult,
      previousClassificationMismatch: null,
    });
    useAllVehicleBrandsMock.mockReturnValue({
      data: [{ id: "known-brand", name: "Toyota", category_group: "bil" }],
    });
    useAllVehicleModelsMock.mockReturnValue({
      data: [{ id: "known-model", brand_id: "known-brand", name: "Corolla", class_id: null }],
    });
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams()));
    await act(() => result.current.runVehicleLookup("EK12345"));

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    // Both brand and model already resolve synchronously from the cached
    // catalog in this case (no server round-trip needed), so this holds
    // without any extra flush.
    expect(createVehicleBrandMock).not.toHaveBeenCalled();
    expect(createVehicleModelMock).not.toHaveBeenCalled();
  });

  it("confirmVehicleData still advances the wizard when the brand proposal fails", async () => {
    window.scrollTo = vi.fn();
    lookupVehicleByRegNumberMock.mockResolvedValue({
      lookup: lookupResult,
      previousClassificationMismatch: null,
    });
    createVehicleBrandMock.mockRejectedValue(new Error("network blip"));
    const goNext = vi.fn();
    const { result } = renderHook(() => useVehicleLookupFlow(makeParams({ goNext })));
    await act(() => result.current.runVehicleLookup("EK12345"));

    act(() => result.current.confirmVehicleData(CAR_CATEGORY_ID, "bil"));

    // goNext runs synchronously in confirmVehicleData, before the
    // fire-and-forget proposal's rejection is even caught — the rejection
    // never reaches confirmVehicleData's caller (swallowed inside
    // proposeUnknownVehicle's own try/catch), so it can never block this.
    expect(goNext).toHaveBeenCalled();
  });
});
