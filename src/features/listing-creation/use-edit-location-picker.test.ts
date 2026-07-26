// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditLocationPicker } from "./use-edit-location-picker";

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
}));

const lookupPostalCodeMock = vi.fn();
const lookupCityMock = vi.fn();
const reverseGeocodeAddressMock = vi.fn();
vi.mock("@/lib/geocode", () => ({
  lookupPostalCode: (...args: unknown[]) => lookupPostalCodeMock(...args),
  lookupCity: (...args: unknown[]) => lookupCityMock(...args),
  reverseGeocodeAddress: (...args: unknown[]) => reverseGeocodeAddressMock(...args),
}));

const getCurrentPositionMock = vi.fn();
const requestLocationPermissionMock = vi.fn();
vi.mock("@/lib/native", () => ({
  getCurrentPosition: (...args: unknown[]) => getCurrentPositionMock(...args),
  requestLocationPermission: (...args: unknown[]) => requestLocationPermissionMock(...args),
  isNative: () => false,
}));

beforeEach(() => {
  lookupPostalCodeMock.mockReset();
  lookupCityMock.mockReset();
  reverseGeocodeAddressMock.mockReset();
  getCurrentPositionMock.mockReset();
  requestLocationPermissionMock.mockReset();
});

describe("useEditLocationPicker", () => {
  it("hydrates coords from the existing listing's lat/lng", () => {
    const { result } = renderHook(() =>
      useEditLocationPicker({
        listing: { id: "l-1", lat: 59.9, lng: 10.7, postal_code: null, city: null },
        postalCode: "",
        city: "",
        setValue: vi.fn(),
      }),
    );

    expect(result.current.coords).toEqual({ lat: 59.9, lng: 10.7 });
  });

  it("does not set coords when the listing has no lat/lng", () => {
    const { result } = renderHook(() =>
      useEditLocationPicker({
        listing: { id: "l-1", lat: null, lng: null, postal_code: null, city: null },
        postalCode: "",
        city: "",
        setValue: vi.fn(),
      }),
    );

    expect(result.current.coords).toBeNull();
  });

  it("defaults the location method to postal when the listing already has a postal code or city", () => {
    const { result } = renderHook(() =>
      useEditLocationPicker({
        listing: { id: "l-1", lat: null, lng: null, postal_code: "0150", city: "Oslo" },
        postalCode: "0150",
        city: "Oslo",
        setValue: vi.fn(),
      }),
    );

    expect(result.current.locationMethod).toBe("postal");
  });

  it("leaves the location method unset when the listing has no location yet", () => {
    const { result } = renderHook(() =>
      useEditLocationPicker({
        listing: { id: "l-1", lat: null, lng: null, postal_code: null, city: null },
        postalCode: "",
        city: "",
        setValue: vi.fn(),
      }),
    );

    expect(result.current.locationMethod).toBeNull();
  });

  it("auto-fills the postal code from a typed city (edit-only direction)", async () => {
    lookupCityMock.mockResolvedValue({ postal_code: "5003", lat: 60.4, lng: 5.3 });
    const setValue = vi.fn();
    const { result, rerender } = renderHook(
      ({ city }) =>
        useEditLocationPicker({
          listing: { id: "l-1", lat: null, lng: null, postal_code: null, city: null },
          postalCode: "",
          city,
          setValue,
        }),
      { initialProps: { city: "" } },
    );
    act(() => {
      result.current.lastEditedRef.current = "city";
    });

    rerender({ city: "Bergen" });

    await waitFor(() =>
      expect(setValue).toHaveBeenCalledWith("postal_code", "5003", { shouldValidate: false }),
    );
  });

  it("switchToPostal resets fields and selects the postal method", () => {
    const setValue = vi.fn();
    const { result } = renderHook(() =>
      useEditLocationPicker({
        listing: { id: "l-1", lat: null, lng: null, postal_code: null, city: null },
        postalCode: "",
        city: "",
        setValue,
      }),
    );

    act(() => result.current.switchToPostal());

    expect(result.current.locationMethod).toBe("postal");
    expect(setValue).toHaveBeenCalledWith("postal_code", "");
    expect(setValue).toHaveBeenCalledWith("city", "");
  });

  it("fetchMyLocation stores the resolved position and reverse-geocoded fields", async () => {
    getCurrentPositionMock.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    reverseGeocodeAddressMock.mockResolvedValue({ city: "Trondheim", postal_code: "7010" });
    const setValue = vi.fn();
    const { result } = renderHook(() =>
      useEditLocationPicker({
        listing: { id: "l-1", lat: null, lng: null, postal_code: null, city: null },
        postalCode: "",
        city: "",
        setValue,
      }),
    );

    await act(() => result.current.fetchMyLocation());

    expect(result.current.coords).toEqual({ lat: 1, lng: 2 });
    expect(setValue).toHaveBeenCalledWith("city", "Trondheim", { shouldValidate: false });
    expect(result.current.locationLoading).toBe(false);
  });
});
