// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverlayHistory } from "./use-overlay-history";

/** Opprydningen er utsatt én tick, jf. hookens kommentar. */
const tick = () => new Promise((r) => setTimeout(r, 5));

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
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const { unmount } = renderHook(() => useOverlayHistory(true, () => {}));

    unmount();
    await tick();
    expect(back).toHaveBeenCalledTimes(1);
  });

  it("beholder oppføringen når overlayet remonteres umiddelbart (lazy + Suspense)", async () => {
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
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
    const back = vi.spyOn(history, "back").mockImplementation(() => {});
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayHistory(false, onClose));

    window.dispatchEvent(new PopStateEvent("popstate"));
    unmount();
    await tick();
    expect(onClose).not.toHaveBeenCalled();
    expect(back).not.toHaveBeenCalled();
  });
});
