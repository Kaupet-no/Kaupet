// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GuestPublishSheet } from "./guest-publish-sheet";

afterEach(() => {
  cleanup();
});

describe("GuestPublishSheet", () => {
  it("shows the draft-kept title and both sign-in/sign-up actions", () => {
    render(<GuestPublishSheet open onOpenChange={vi.fn()} onSignIn={vi.fn()} onSignUp={vi.fn()} />);

    expect(
      screen.getByRole("heading", { name: "Nesten ute! Logg inn for å publisere" }),
    ).toBeTruthy();
    expect(
      screen.getByText(
        "Annonsen er lagret på denne enheten og blir publisert når du er logget inn.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Logg inn" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Opprett konto" })).toBeTruthy();
  });

  it("calls onSignIn/onSignUp when the respective button is clicked", () => {
    const onSignIn = vi.fn();
    const onSignUp = vi.fn();
    render(
      <GuestPublishSheet open onOpenChange={vi.fn()} onSignIn={onSignIn} onSignUp={onSignUp} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Logg inn" }));
    expect(onSignIn).toHaveBeenCalledTimes(1);
    expect(onSignUp).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Opprett konto" }));
    expect(onSignUp).toHaveBeenCalledTimes(1);
  });

  it("is not rendered in the DOM when closed", () => {
    render(
      <GuestPublishSheet
        open={false}
        onOpenChange={vi.fn()}
        onSignIn={vi.fn()}
        onSignUp={vi.fn()}
      />,
    );

    expect(screen.queryByText("Nesten ute! Logg inn for å publisere")).toBeNull();
  });
});
