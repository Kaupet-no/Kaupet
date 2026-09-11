import { describe, expect, it } from "vitest";

import { shouldShowPlanBackButton } from "./velg-plan";

describe("planoversiktens tilbakeknapp", () => {
  it("viser ikke tilbakeknappen før organisasjonen har valgt plan", () => {
    expect(shouldShowPlanBackButton(null)).toBe(false);
  });

  it("viser tilbakeknappen etter at organisasjonen har valgt plan", () => {
    expect(shouldShowPlanBackButton("proff_basis")).toBe(true);
    expect(shouldShowPlanBackButton("proff")).toBe(true);
  });
});
