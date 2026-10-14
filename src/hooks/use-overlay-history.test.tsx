// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverlayHistory } from "./use-overlay-history";

/** Opprydningen er utsatt én tick, jf. hookens kommentar. */
const tick = () => new Promise((r) => setTimeout(r, 5));

/** Ekte history.back() gir popstate, som hooken forventer og ignorerer. */
const mockBack = () =>
  vi
    .spyOn(history, "back")
    .mockImplementation(() => window.dispatchEvent(new PopStateEvent("popstate")));

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, "");
});

describe("useOverlayHistory", () => {
  it("legger på en historikk-oppføring og lukker på popstate", async () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayHistory(true, onClose));

    expect((history.state as { overlay?: boolean } | null)?.overlay).toBe(true);

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    await tick();
  });

  it("rydder oppføringen når overlayet lukkes på annen måte", async () => {
    const back = mockBack();
    const { unmount } = renderHook(() => useOverlayHistory(true, () => {}));

    unmount();
    await tick();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("beholder oppføringen når overlayet remonteres umiddelbart (lazy + Suspense)", async () => {
    const back = mockBack();
    const push = vi.spyOn(history, "pushState");

    const first = renderHook(() => useOverlayHistory(true, () => {}));
    first.unmount();
    const second = renderHook(() => useOverlayHistory(true, () => {}));
    await tick();

    expect(push).toHaveBeenCalledTimes(1);
    expect(back).not.toHaveBeenCalled();

    second.unmount();
    await tick();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("gjør ingenting når den er deaktivert", async () => {
    const back = mockBack();
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayHistory(false, onClose));

    window.dispatchEvent(new PopStateEvent("popstate"));
    unmount();
    await tick();
    expect(onClose).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });

  it("tilbake lukker bare øverste nivå når overlays er nøstet (KG-37-F02)", async () => {
    mockBack();
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    const parent = renderHook(() => useOverlayHistory(true, closeParent));
    const child = renderHook(() => useOverlayHistory(true, closeChild));

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
    child.unmount();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(closeParent).toHaveBeenCalledTimes(1);
    parent.unmount();
    await tick();
  });

  it("opprydding av et lukket barn lukker ikke forelderen", async () => {
    mockBack();
    const closeParent = vi.fn();
    const parent = renderHook(() => useOverlayHistory(true, closeParent));
    const child = renderHook(() => useOverlayHistory(true, () => {}));

    child.unmount();
    await tick();
    expect(history.back).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();

    window.dispatchEvent(new PopStateEvent("popstate"));
    expect(closeParent).toHaveBeenCalledTimes(1);
    parent.unmount();
    await tick();
  });
});
