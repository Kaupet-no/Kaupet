// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Vehicle360CaptureFlow } from "./capture-flow";

const { upload, complete, getUserMedia } = vi.hoisted(() => ({
  upload: vi.fn(),
  complete: vi.fn(),
  getUserMedia: vi.fn(),
}));
vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));
vi.mock("@/lib/vehicle/vehicle-360.functions", () => ({
  MIN_360_FRAMES: 16,
  TARGET_360_FRAMES: 24,
  uploadVehicle360Frame: upload,
  completeVehicle360CaptureSession: complete,
}));
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn(), showSuccessToast: vi.fn() }));
vi.mock("@/lib/image-compression", () => ({ compressImage: async (file: File) => file }));

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  Object.defineProperty(navigator, "mediaDevices", { configurable: true, value: { getUserMedia } });
  vi.stubGlobal("DeviceOrientationEvent", undefined);
  vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(32 * 24 * 4).fill(Math.random() * 255) }),
  } as unknown as CanvasRenderingContext2D);
  vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation((cb) =>
    cb(new Blob(["jpeg"], { type: "image/jpeg" })),
  );
  vi.stubGlobal("URL", { createObjectURL: () => "blob:frame" });
  vi.stubGlobal(
    "FileReader",
    class {
      result = "data:image/jpeg;base64,amVwZw==";
      onload?: () => void;
      readAsDataURL() {
        this.onload?.();
      }
    },
  );
  upload.mockResolvedValue({ ok: true });
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function setup(count: number, orders = Array.from({ length: 36 - count }, (_, i) => count + i)) {
  return render(
    <Vehicle360CaptureFlow
      token="token"
      listingTitle="Bil"
      existingFrameCount={count}
      availableFrameOrders={orders}
    />,
  );
}
it.each([0, 15, 24, 36])(
  "fullføring bruker hele sekvensen med %i lagrede bilder (KG-34-F01)",
  (count) => {
    setup(count);
    if (count)
      expect((screen.getByRole("button", { name: /^Fullfør/ }) as HTMLButtonElement).disabled).toBe(
        count < 16,
      );
    expect(
      (screen.getByRole("button", { name: /^(Start|Fortsett) opptak$/ }) as HTMLButtonElement)
        .disabled,
    ).toBe(count === 36);
  },
);
it("fyller bare et ledig hull og stopper ved kapasitet; feil kan prøves igjen", async () => {
  const stop = vi.fn();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
  upload.mockRejectedValueOnce(new Error("offline"));
  setup(35, [7]);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Fortsett opptak/ }));
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1000);
  });
  expect(upload).toHaveBeenCalledTimes(1);
  expect(upload.mock.calls[0][0].data.frameOrder).toBe(7);
  expect(stop).toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /Prøv mislykkede/ }));
  });
  expect(upload).toHaveBeenCalledTimes(2);
  expect(upload.mock.calls[1][0].data.frameOrder).toBe(7);
});
it("stopper sent kamerasvar etter unmount (KG-34-F03)", async () => {
  let resolve!: (stream: unknown) => void;
  getUserMedia.mockReturnValue(
    new Promise((r) => {
      resolve = r;
    }),
  );
  const view = setup(0);
  fireEvent.click(screen.getByRole("button", { name: "Start opptak" }));
  view.unmount();
  const stop = vi.fn();
  await act(async () => {
    resolve({ getTracks: () => [{ stop }] });
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
});
it("stopper kameraet hvis play feiler, og tillater ny oppstart", async () => {
  const stop = vi.fn();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
  vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValueOnce(new Error("play"));
  setup(0);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start opptak" }));
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(screen.getByText(/Fikk ikke tilgang/)).toBeTruthy();
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start opptak" }));
  });
  expect(getUserMedia).toHaveBeenCalledTimes(2);
});

it("avbrutt sensortillatelse starter aldri kamera", async () => {
  let resolve!: (permission: string) => void;
  vi.stubGlobal("DeviceOrientationEvent", {
    requestPermission: () =>
      new Promise((r) => {
        resolve = r;
      }),
  });
  const view = setup(0);
  fireEvent.click(screen.getByRole("button", { name: "Start opptak" }));
  view.unmount();
  await act(async () => {
    resolve("granted");
  });
  expect(getUserMedia).not.toHaveBeenCalled();
});
it("avbrutt play og dobbeltstart oppretter ingen sen opptaksloop", async () => {
  const stop = vi.fn();
  getUserMedia.mockResolvedValue({ getTracks: () => [{ stop }] });
  let resolve!: () => void;
  vi.mocked(HTMLMediaElement.prototype.play).mockReturnValue(
    new Promise<void>((r) => {
      resolve = r;
    }),
  );
  const view = setup(0);
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Start opptak" }));
  });
  fireEvent.click(screen.getByRole("button", { name: "Starter kamera …" }));
  expect(getUserMedia).toHaveBeenCalledOnce();
  view.unmount();
  await act(async () => {
    resolve();
    await vi.advanceTimersByTimeAsync(2000);
  });
  expect(stop).toHaveBeenCalledOnce();
  expect(upload).not.toHaveBeenCalled();
});
