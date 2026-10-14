// @vitest-environment jsdom
import { act, cleanup, fireEvent, render } from "@testing-library/react";
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
