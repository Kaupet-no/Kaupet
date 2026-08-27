// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useComposerHistoryBack } from "./use-composer-history";

describe("useComposerHistoryBack", () => {
  it("går ett steg tilbake og beholder vakten når komponisten ikke er på første steg", () => {
    const goBack = vi.fn();
    const pushState = vi.spyOn(window.history, "pushState");
    const { rerender } = renderHook(({ isFirst }) => useComposerHistoryBack(isFirst, goBack), {
      initialProps: { isFirst: true },
    });

    rerender({ isFirst: false });
    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(goBack).toHaveBeenCalledOnce();
    expect(pushState).toHaveBeenCalledTimes(2);
    pushState.mockRestore();
  });

  it("lar vanlig rutenavigasjon fortsette fra første steg", () => {
    const goBack = vi.fn();
    renderHook(() => useComposerHistoryBack(true, goBack));

    act(() => window.dispatchEvent(new PopStateEvent("popstate")));

    expect(goBack).not.toHaveBeenCalled();
  });
  it("beholder steget når et overlay lukker tilbake til komponistvakten", () => {
    const goBack = vi.fn();
    renderHook(() => useComposerHistoryBack(false, goBack));

    act(() =>
      window.dispatchEvent(new PopStateEvent("popstate", { state: { composerGuard: true } })),
    );

    expect(goBack).not.toHaveBeenCalled();
  });
});
