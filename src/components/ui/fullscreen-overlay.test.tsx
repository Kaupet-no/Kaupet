// @vitest-environment jsdom
import * as React from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DialogClose, DialogTrigger } from "./dialog";
import { FullscreenOverlay, FullscreenOverlayContent } from "./fullscreen-overlay";
afterEach(cleanup);

describe("FullscreenOverlay", () => {
  it("exposes a dialog, closes, and returns focus to the opener", async () => {
    function Harness() {
      const [open, setOpen] = React.useState(false);
      return (
        <>
          <FullscreenOverlay open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <button type="button">Åpne kart</button>
            </DialogTrigger>
            <FullscreenOverlayContent title="Kart">
              <DialogClose asChild>
                <button type="button">Lukk kart</button>
              </DialogClose>
            </FullscreenOverlayContent>
          </FullscreenOverlay>
        </>
      );
    }

    const { getByRole, queryByRole } = render(<Harness />);
    const opener = getByRole("button", { name: "Åpne kart" });
    fireEvent.click(opener);
    await waitFor(() => expect(getByRole("dialog")).toBeTruthy());

    fireEvent.click(getByRole("button", { name: "Lukk kart" }));
    await waitFor(() => {
      expect(queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(opener);
    });
  });
});
