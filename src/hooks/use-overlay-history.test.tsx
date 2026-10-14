// @vitest-environment jsdom
import { render, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOverlayHistory } from "./use-overlay-history";

/** Opprydningen er utsatt én tick, jf. hookens kommentar. */
const tick = () => new Promise((r) => setTimeout(r, 5));

/** jsdoms history traverserer asynkront og fyrer popstate med tilstanden. */
const pressBack = async () => {
  history.back();
  await tick();
};
const spyGo = () => vi.spyOn(history, "go");
const level = () => (history.state as { overlayLevel?: number } | null)?.overlayLevel ?? 0;

afterEach(() => {
  vi.restoreAllMocks();
  history.replaceState(null, "");
});

describe("useOverlayHistory", () => {
  it("legger på en historikk-oppføring og lukker på popstate", async () => {
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayHistory(true, onClose));

    expect((history.state as { overlay?: boolean } | null)?.overlay).toBe(true);

    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);

    unmount();
    await tick();
  });

  it("rydder oppføringen når overlayet lukkes på annen måte", async () => {
    const go = spyGo();
    const { unmount } = renderHook(() => useOverlayHistory(true, () => {}));

    unmount();
    await tick();
    expect(go).toHaveBeenCalledExactlyOnceWith(-1);
    await tick();
    expect(level()).toBe(0);
  });

  it("beholder oppføringen når overlayet remonteres umiddelbart (lazy + Suspense)", async () => {
    const go = spyGo();
    const push = vi.spyOn(history, "pushState");

    const first = renderHook(() => useOverlayHistory(true, () => {}));
    first.unmount();
    const second = renderHook(() => useOverlayHistory(true, () => {}));
    await tick();

    expect(push).toHaveBeenCalledTimes(1);
    expect(go).not.toHaveBeenCalled();

    second.unmount();
    await tick();
    expect(go).toHaveBeenCalledExactlyOnceWith(-1);
    await tick();
  });

  it("gjør ingenting når den er deaktivert", async () => {
    const go = spyGo();
    const push = vi.spyOn(history, "pushState");
    const onClose = vi.fn();
    const { unmount } = renderHook(() => useOverlayHistory(false, onClose));

    unmount();
    await tick();
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    expect(go).not.toHaveBeenCalled();
  });

  it("tilbake lukker bare øverste nivå når overlays er nøstet (KG-37-F02)", async () => {
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    const parent = renderHook(() => useOverlayHistory(true, closeParent));
    const child = renderHook(() => useOverlayHistory(true, closeChild));

    await pressBack();
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
    child.unmount();

    await pressBack();
    expect(closeParent).toHaveBeenCalledTimes(1);
    parent.unmount();
    await tick();
  });

  it("forelder og barn som åpnes i samme render: tilbake lukker barnet", async () => {
    const closeParent = vi.fn();
    const closeChild = vi.fn();
    function Child() {
      useOverlayHistory(true, closeChild);
      return null;
    }
    function Parent() {
      useOverlayHistory(true, closeParent);
      return <Child />;
    }
    const { unmount } = render(<Parent />);

    await pressBack();
    expect(closeChild).toHaveBeenCalledTimes(1);
    expect(closeParent).not.toHaveBeenCalled();
    unmount();
    await tick();
  });

  it("opprydding av et lukket barn lukker ikke forelderen", async () => {
    const go = spyGo();
    const closeParent = vi.fn();
    const parent = renderHook(() => useOverlayHistory(true, closeParent));
    const child = renderHook(() => useOverlayHistory(true, () => {}));

    child.unmount();
    await tick();
    await tick();
    expect(go).toHaveBeenCalledExactlyOnceWith(-1);
    expect(closeParent).not.toHaveBeenCalled();
    expect(level()).toBe(1);

    await pressBack();
    expect(closeParent).toHaveBeenCalledTimes(1);
    parent.unmount();
    await tick();
  });

  it("forelder og barn som lukkes samtidig gir én traversering forbi begge", async () => {
    const go = spyGo();
    const closeParent = vi.fn();
    function Child() {
      useOverlayHistory(true, () => {});
      return null;
    }
    function Parent() {
      useOverlayHistory(true, closeParent);
      return <Child />;
    }
    const { unmount } = render(<Parent />);
    expect(level()).toBe(2);

    unmount();
    await tick();
    await tick();
    expect(go).toHaveBeenCalledExactlyOnceWith(-2);
    expect(level()).toBe(0);
    expect(closeParent).not.toHaveBeenCalled();
  });

  it("en avbrutt opprydding sluker ikke neste tilbaketrykk", async () => {
    // Traverseringen fra oppryddingen fullføres aldri (f.eks. avbrutt av en
    // ruteendring som pusher ny tilstand).
    vi.spyOn(history, "go").mockImplementation(() => {});
    vi.spyOn(history, "back").mockImplementation(() => {});
    const first = renderHook(() => useOverlayHistory(true, () => {}));
    first.unmount();
    await tick();
    history.pushState({ route: "ny" }, "");
    vi.restoreAllMocks();

    const onClose = vi.fn();
    const next = renderHook(() => useOverlayHistory(true, onClose));
    await pressBack();
    expect(onClose).toHaveBeenCalledTimes(1);
    next.unmount();
    await tick();
  });
});
