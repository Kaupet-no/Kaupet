// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { SellerNoKnownIssues } from "./listing-evidence";

it("viser fravær av oppgitte feil som en nøytral selgeropplysning", () => {
  const { container } = render(<SellerNoKnownIssues />);

  expect(screen.getByRole("note", { name: "Selgeropplysning" })).toBeTruthy();
  expect(screen.getByText("Oppgitt av selger")).toBeTruthy();
  expect(
    screen.getByText("Selger har oppgitt at kjøretøyet ikke har kjente feil eller mangler."),
  ).toBeTruthy();
  expect(screen.queryByText(/verifisert|kontrollert|bekreftet/i)).toBeNull();
  expect(container.firstElementChild?.classList.contains("bg-muted/40")).toBe(true);
});
