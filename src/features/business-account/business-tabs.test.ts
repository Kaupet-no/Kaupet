import { describe, expect, it } from "vitest";

import { isBusinessTabVisible } from "./business-tabs";

describe("isBusinessTabVisible", () => {
  it("viser Integrasjoner kun for superbruker med aktiv Proff", () => {
    expect(isBusinessTabVisible("integrasjoner", { role: "superuser", effectiveProff: true })).toBe(
      true,
    );
    expect(
      isBusinessTabVisible("integrasjoner", { role: "superuser", effectiveProff: false }),
    ).toBe(false);
    expect(isBusinessTabVisible("integrasjoner", { role: "member", effectiveProff: true })).toBe(
      false,
    );
  });

  it("beholder eksisterende regler for Brukere og Administrer", () => {
    expect(isBusinessTabVisible("brukere", { role: "superuser", effectiveProff: false })).toBe(
      false,
    );
    expect(isBusinessTabVisible("administrer", { role: "superuser", effectiveProff: false })).toBe(
      true,
    );
    expect(isBusinessTabVisible("administrer", { role: "member", effectiveProff: true })).toBe(
      false,
    );
  });

  it("viser de øvrige fanene for alle medlemmer", () => {
    for (const tab of ["oversikt", "annonser", "meldinger", "bedriftsprofil"]) {
      expect(isBusinessTabVisible(tab, { role: "member", effectiveProff: false })).toBe(true);
    }
  });
});
