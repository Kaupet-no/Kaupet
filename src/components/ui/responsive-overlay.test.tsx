// @vitest-environment jsdom
import { cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "./responsive-overlay";

afterEach(cleanup);

const isNativeMock = vi.fn(() => false);
vi.mock("@/lib/native", () => ({
  isNative: () => isNativeMock(),
}));

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

  it("renders as a bottom Sheet on native", async () => {
    isNativeMock.mockReturnValue(true);
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
});
