// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DialogTrigger } from "./dialog";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "./responsive-overlay";
import { SheetTitle } from "./sheet";

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
  it("closes with Escape and returns focus to the opener", async () => {
    isNativeMock.mockReturnValue(false);
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <ResponsiveOverlay open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <button type="button">Åpne</button>
          </DialogTrigger>
          <ResponsiveOverlayContent>
            <div>innhold</div>
          </ResponsiveOverlayContent>
        </ResponsiveOverlay>
      );
    }

    const { getByRole, queryByText } = render(<Harness />);
    const opener = getByRole("button", { name: "Åpne" });
    opener.focus();
    fireEvent.click(opener);
    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());
    fireEvent.keyDown(getByRole("dialog"), { key: "Escape" });

    await waitFor(() => {
      expect(queryByText("innhold")).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });

  it("expands an expandable phone sheet before scrolling its content", async () => {
    isNativeMock.mockReturnValue(true);
    setViewportWidth(375);
    const { findByText, baseElement } = render(
      <ResponsiveOverlay open onOpenChange={() => {}}>
        <ResponsiveOverlayContent expandable initialSnapPoint={0.8}>
          <SheetTitle className="sr-only">Testpanel</SheetTitle>
          <div>innhold</div>
        </ResponsiveOverlayContent>
      </ResponsiveOverlay>,
    );

    const content = (await findByText("innhold")).closest(".overscroll-contain") as HTMLElement;
    const drawer = baseElement.querySelector<HTMLElement>("[data-vaul-drawer]");
    expect(drawer).not.toBeNull();

    content.scrollTop = 12;
    fireEvent.scroll(content);

    await waitFor(() => {
      expect(content.scrollTop).toBe(0);
      expect(drawer?.style.getPropertyValue("--snap-point-height")).toBe("0px");
    });
  });
});
