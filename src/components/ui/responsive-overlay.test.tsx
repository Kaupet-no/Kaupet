// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "./responsive-overlay";

afterEach(cleanup);

const isNativeMock = vi.fn(() => false);
vi.mock("@/lib/native", () => ({
  isNative: () => isNativeMock(),
}));

/** jsdom har ingen matchMedia — `useFormFactor` trenger den for breddegrensen. */
function setViewportWidth(width: number) {
  window.matchMedia = ((query: string) => {
    const min = Number(/min-width:\s*(\d+)px/u.exec(query)?.[1] ?? 0);
    return {
      matches: width >= min,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    } as unknown as MediaQueryList;
  }) as typeof window.matchMedia;
}

describe("ResponsiveOverlay", () => {
  it("renders as a centered Dialog on web", async () => {
    isNativeMock.mockReturnValue(false);
    const { findByText, baseElement } = render(
      <ResponsiveOverlay open onOpenChange={() => {}}>
        <ResponsiveOverlayContent>innhold</ResponsiveOverlayContent>
      </ResponsiveOverlay>,
    );

    await findByText("innhold");
    expect(baseElement.querySelector('[class*="top-\\[50%\\]"]')).not.toBeNull();
  });

  it("renders as a bottom Sheet on a native phone", async () => {
    isNativeMock.mockReturnValue(true);
    setViewportWidth(375);
    const { findByText, baseElement } = render(
      <ResponsiveOverlay open onOpenChange={() => {}}>
        <ResponsiveOverlayContent>innhold</ResponsiveOverlayContent>
      </ResponsiveOverlay>,
    );

    await findByText("innhold");
    await waitFor(() => {
      expect(baseElement.querySelector('[class*="rounded-t-2xl"]')).not.toBeNull();
    });
  });

  it("renders as a centered Dialog on a native tablet", async () => {
    isNativeMock.mockReturnValue(true);
    setViewportWidth(820);
    const { findByText, baseElement } = render(
      <ResponsiveOverlay open onOpenChange={() => {}}>
        <ResponsiveOverlayContent>innhold</ResponsiveOverlayContent>
      </ResponsiveOverlay>,
    );

    await findByText("innhold");
    await waitFor(() => {
      expect(baseElement.querySelector('[class*="top-\\[50%\\]"]')).not.toBeNull();
    });
    expect(baseElement.querySelector('[class*="rounded-t-2xl"]')).toBeNull();
  });
});
