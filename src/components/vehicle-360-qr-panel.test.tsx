// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Vehicle360QrPanel } from "./vehicle-360-qr-panel";
const { create, qr } = vi.hoisted(() => ({ create: vi.fn(), qr: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: [], refetch: vi.fn() }) }));
vi.mock("@/lib/vehicle/vehicle-360.functions", () => ({
  createVehicle360CaptureSession: create,
  getVehicle360Frames: vi.fn(),
  deleteVehicle360Frames: vi.fn(),
}));
vi.mock("@/lib/qr", () => ({ generateBrandedQrDataUrl: qr }));
vi.mock("@/lib/storage", () => ({ signVehicle360FrameUrls: () => ({}) }));
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-13T12:00:00Z"));
  vi.clearAllMocks();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
it("fjerner utløpt QR og lar brukeren generere en ny (KG-34-F02)", async () => {
  create
    .mockResolvedValueOnce({ token: "old", expiresAt: "2026-10-13T12:30:00Z" })
    .mockResolvedValueOnce({ token: "new", expiresAt: "2026-10-13T13:00:00Z" });
  qr.mockImplementation(async (url: string) => "data:" + url);
  await act(async () => {
    render(<Vehicle360QrPanel draftId="draft" ensureDraftId={vi.fn()} />);
  });
  expect(screen.getByRole("img").getAttribute("src")).toContain("/old");
  await act(async () => {
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);
  });
  expect(screen.queryByRole("img")).toBeNull();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Lag ny QR-kode" }));
  });
  expect(screen.getByRole("img").getAttribute("src")).toContain("/new");
  expect(qr.mock.calls[1][0]).toBe(window.location.origin + "/360-opptak/new");
});
it("ignorerer sen generering etter avmontering", async () => {
  let resolve!: (value: unknown) => void;
  create.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = render(<Vehicle360QrPanel draftId="draft" ensureDraftId={vi.fn()} />);
  view.unmount();
  await act(async () => {
    resolve({ token: "late", expiresAt: "2026-10-13T12:30:00Z" });
  });
  expect(qr).not.toHaveBeenCalled();
});
