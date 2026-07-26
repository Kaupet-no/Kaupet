// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useLocationPicker } from "./use-location-picker";

vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
}));

const lookupPostalCodeMock = vi.fn();
const reverseGeocodeAddressMock = vi.fn();
vi.mock("@/lib/geocode", () => ({
  lookupPostalCode: (...args: unknown[]) => lookupPostalCodeMock(...args),
  reverseGeocodeAddress: (...args: unknown[]) => reverseGeocodeAddressMock(...args),
}));

const getCurrentPositionMock = vi.fn();
const requestLocationPermissionMock = vi.fn();
const isNativeMock = vi.fn(() => false);
vi.mock("@/lib/native", () => ({
  getCurrentPosition: (...args: unknown[]) => getCurrentPositionMock(...args),
  requestLocationPermission: (...args: unknown[]) => requestLocationPermissionMock(...args),
  isNative: () => isNativeMock(),
}));

beforeEach(() => {
  lookupPostalCodeMock.mockReset();
  reverseGeocodeAddressMock.mockReset();
  getCurrentPositionMock.mockReset();
  requestLocationPermissionMock.mockReset();
  isNativeMock.mockReset().mockReturnValue(false);
});

describe("useLocationPicker", () => {
  it("switchToPostal clears fields and coords, and selects postal method", () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useLocationPicker({ postalCode: "", setValue }));

    act(() => result.current.switchToPostal());

    expect(result.current.locationMethod).toBe("postal");
    expect(result.current.coords).toBeNull();
    expect(setValue).toHaveBeenCalledWith("postal_code", "");
    expect(setValue).toHaveBeenCalledWith("city", "");
  });

  it("resetLocationMethod clears the method, coords, and form fields", () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useLocationPicker({ postalCode: "", setValue }));
    act(() => result.current.switchToPostal());

    act(() => result.current.resetLocationMethod());

    expect(result.current.locationMethod).toBeNull();
    expect(result.current.coords).toBeNull();
  });

  it("fetchMyLocation sets coords and city/postal from the reverse-geocoded position", async () => {
    getCurrentPositionMock.mockResolvedValue({ coords: { latitude: 59.9, longitude: 10.7 } });
    reverseGeocodeAddressMock.mockResolvedValue({ city: "Oslo", postal_code: "0150" });
    const setValue = vi.fn();
    const { result } = renderHook(() => useLocationPicker({ postalCode: "", setValue }));

    await act(() => result.current.fetchMyLocation());

    expect(result.current.locationMethod).toBe("gps");
    expect(result.current.locationLoading).toBe(false);
    expect(result.current.coords).toEqual({ lat: 59.9, lng: 10.7 });
    expect(setValue).toHaveBeenCalledWith("city", "Oslo", { shouldValidate: false });
    expect(setValue).toHaveBeenCalledWith("postal_code", "0150", { shouldValidate: false });
  });

  it("fetchMyLocation shows an error and resets the method when the position is unavailable", async () => {
    const { showErrorToast } = await import("@/lib/toast");
    getCurrentPositionMock.mockResolvedValue(null);
    const setValue = vi.fn();
    const { result } = renderHook(() => useLocationPicker({ postalCode: "", setValue }));

    await act(() => result.current.fetchMyLocation());

    expect(result.current.locationMethod).toBeNull();
    expect(result.current.locationLoading).toBe(false);
    expect(showErrorToast).toHaveBeenCalledWith("Kunne ikke hente posisjon.");
  });

  it("fetchMyLocation stops early on native without location permission", async () => {
    const { showErrorToast } = await import("@/lib/toast");
    isNativeMock.mockReturnValue(true);
    requestLocationPermissionMock.mockResolvedValue("denied");
    const setValue = vi.fn();
    const { result } = renderHook(() => useLocationPicker({ postalCode: "", setValue }));

    await act(() => result.current.fetchMyLocation());

    expect(getCurrentPositionMock).not.toHaveBeenCalled();
    expect(result.current.locationMethod).toBeNull();
    expect(showErrorToast).toHaveBeenCalledWith("Gi appen tilgang til posisjon i innstillingene.");
  });

  it("switchToGps clears fields then runs fetchMyLocation", async () => {
    getCurrentPositionMock.mockResolvedValue({ coords: { latitude: 1, longitude: 2 } });
    reverseGeocodeAddressMock.mockResolvedValue({ city: null, postal_code: null });
    const setValue = vi.fn();
    const { result } = renderHook(() => useLocationPicker({ postalCode: "", setValue }));

    await act(() => result.current.switchToGps());

    expect(setValue).toHaveBeenCalledWith("postal_code", "");
    expect(result.current.locationMethod).toBe("gps");
  });

  it("auto-fills the city and coords once a valid postal code is typed after the postal field was last edited", async () => {
    lookupPostalCodeMock.mockResolvedValue({ city: "Bergen", lat: 60.4, lng: 5.3 });
    const setValue = vi.fn();
    const { result, rerender } = renderHook(
      ({ postalCode }) => useLocationPicker({ postalCode, setValue }),
      { initialProps: { postalCode: "" } },
    );

    act(() => {
      result.current.lastEditedRef.current = "postal_code";
    });
    rerender({ postalCode: "5003" });

    await waitFor(() => {
      expect(setValue).toHaveBeenCalledWith("city", "Bergen", { shouldValidate: false });
      expect(result.current.coords).toEqual({ lat: 60.4, lng: 5.3 });
    });
  });

  it("does not look up an incomplete postal code", async () => {
    const setValue = vi.fn();
    const { rerender, result } = renderHook(
      ({ postalCode }) => useLocationPicker({ postalCode, setValue }),
      { initialProps: { postalCode: "" } },
    );
    act(() => {
      result.current.lastEditedRef.current = "postal_code";
    });

    rerender({ postalCode: "50" });
    await new Promise((r) => setTimeout(r, 600));

    expect(lookupPostalCodeMock).not.toHaveBeenCalled();
  });
});
