import { describe, expect, it } from "vitest";
import { assertDraftActor, assertDraftOrganization } from "./draft-actor";

describe("DEF-DRAFT-01: server actor boundary", () => {
  it("accepts the original user and organization", () => {
    expect(() => assertDraftActor("a", "a")).not.toThrow();
    expect(() => assertDraftOrganization("org-a", "org-a")).not.toThrow();
    expect(() => assertDraftOrganization(null, null)).not.toThrow();
  });
  it("rejects a changed session before creating a row", () => {
    expect(() => assertDraftActor("a", "b")).toThrow("Kontoen er endret");
    try {
      assertDraftActor("a", "b");
    } catch (error) {
      expect(error).toMatchObject({ status: 409 });
    }
  });
  it.each([
    ["org-a", null],
    [null, "org-a"],
    ["org-a", "org-b"],
  ])("rejects organization transition %s → %s", (expected, actual) => {
    expect(() => assertDraftOrganization(expected, actual)).toThrow(
      "Bedriftstilknytningen er endret",
    );
  });
  it("keeps existing non-composer callers compatible without weakening their own authorization", () => {
    expect(() => assertDraftActor(undefined, "a")).not.toThrow();
    expect(() => assertDraftOrganization(undefined, "org-a")).not.toThrow();
  });
});
