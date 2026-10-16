// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const embla = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = { index: 0, total: 2 };
  const api = {
    selectedScrollSnap: () => state.index,
    on: (_event: string, cb: () => void) => listeners.add(cb),
    off: (_event: string, cb: () => void) => listeners.delete(cb),
    scrollTo: (i: number) => {
      state.index = i;
      listeners.forEach((cb) => cb());
    },
    scrollNext: () => api.scrollTo((state.index + 1) % state.total),
    scrollPrev: () => api.scrollTo((state.index - 1 + state.total) % state.total),
  };
  return {
    api,
    state,
    options: undefined as undefined | { watchDrag: (a: typeof api) => boolean },
  };
});

vi.mock("embla-carousel-react", () => ({
  default: (options: typeof embla.options) => {
    embla.options = options;
    return [() => {}, embla.api];
  },
}));
vi.mock("@/lib/orientation", () => ({
  lockPortraitOnPhone: vi.fn(async () => {}),
  unlockOrientation: vi.fn(async () => {}),
}));
vi.mock("@/components/listing-detail/vehicle/vehicle-360-viewer", () => ({
  Vehicle360Viewer: () => null,
}));
vi.mock("@/hooks/use-form-factor", () => ({ useIsNarrow: () => false }));

import { ImageLightbox } from "./image-lightbox";

afterEach(cleanup);

function doubleTap(el: Element) {
  for (let i = 0; i < 2; i++) {
    const touch = { clientX: 10, clientY: 10 };
    fireEvent.touchStart(el, { touches: [touch], changedTouches: [touch] });
    fireEvent.touchEnd(el, { touches: [], changedTouches: [touch] });
  }
}

const canDrag = () => embla.options!.watchDrag(embla.api);

describe("ImageLightbox – zoom per slide (KG-31-F02)", () => {
  it("åpner og lukker KI-forklaringen uten å lukke bildegalleriet (A11Y-04)", async () => {
    const onClose = vi.fn();
    const { getByRole, queryByRole } = render(
      <ImageLightbox
        images={[{ storage_path: "a", sort_order: 0, ai_generated: true }]}
        imgUrls={{ a: "https://img/a" }}
        initialIndex={0}
        title="Sofa"
        onClose={onClose}
      />,
    );
    const trigger = getByRole("button", { name: "Merket som KI" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(getByRole("dialog", { name: "Merket som KI-generert" })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Lukk forklaring" }));
    await waitFor(() => {
      expect(queryByRole("dialog", { name: "Merket som KI-generert" })).toBeNull();
      expect(getByRole("dialog", { name: "Bildegalleri for Sofa" })).toBeTruthy();
      expect(document.activeElement).toBe(trigger);
    });
    expect(onClose).not.toHaveBeenCalled();
  });

  it("låser opp sveiping når man går fra et zoomet bilde til neste", () => {
    embla.state.index = 0;
    const { getByAltText, getByRole } = render(
      <ImageLightbox
        images={[
          { storage_path: "a", sort_order: 0 },
          { storage_path: "b", sort_order: 1 },
        ]}
        imgUrls={{ a: "https://img/a", b: "https://img/b" }}
        initialIndex={0}
        title="Sofa"
        onClose={vi.fn()}
      />,
    );

    doubleTap(getByAltText("Sofa").parentElement!);
    expect(canDrag()).toBe(false);

    act(() => fireEvent.click(getByRole("button", { name: "Neste bilde" })));
    expect(canDrag()).toBe(true);

    // Tilbake til A: zoomen er nullstilt, ikke en foreldet tilstand.
    act(() => fireEvent.click(getByRole("button", { name: "Gå til bilde 1" })));
    expect(canDrag()).toBe(true);
    expect(getByAltText("Sofa").getAttribute("style")).toContain("scale(1)");
  });
});
