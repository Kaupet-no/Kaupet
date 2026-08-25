// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NoImageDialog } from "./no-image-dialog";

afterEach(cleanup);

describe("NoImageDialog", () => {
  it("forklarer nytten nøytralt og tilbyr begge handlingene", () => {
    const onOpenChange = vi.fn();
    const onContinue = vi.fn();

    render(<NoImageDialog open onOpenChange={onOpenChange} onContinue={onContinue} />);

    expect(screen.getByRole("alertdialog", { name: "Ingen bilder lagt til" })).toBeTruthy();
    expect(
      screen.getByText(
        "Bilder kan gjøre det enklere for andre å vurdere annonsen. Du kan legge til bilder nå eller fortsette uten.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Legg til bilder" })).toBeTruthy();
    expect(screen.getByTestId("continue-without-image-button").textContent).toBe(
      "Fortsett uten bilde",
    );
    expect(screen.queryByText(/selger mye raskere/i)).toBeNull();
  });

  it("lar brukeren legge til bilder eller fortsette uten bilde", () => {
    const onOpenChange = vi.fn();
    const onContinue = vi.fn();

    render(<NoImageDialog open onOpenChange={onOpenChange} onContinue={onContinue} />);

    fireEvent.click(screen.getByRole("button", { name: "Legg til bilder" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);

    fireEvent.click(screen.getByTestId("continue-without-image-button"));
    expect(onContinue).toHaveBeenCalledOnce();
  });
});
