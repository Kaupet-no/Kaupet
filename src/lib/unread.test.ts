import { describe, expect, it } from "vitest";

import { isUnread } from "./unread";

describe("isUnread", () => {
  const at = "2026-10-01T10:00:00Z";

  it("teller ikke en samtale uten meldinger som ulest", () => {
    expect(isUnread(at, null, "seller", null)).toBe(false);
  });

  it("teller en ulest melding fra motparten", () => {
    expect(isUnread(at, "buyer", "seller", null)).toBe(true);
    expect(isUnread(at, "buyer", "seller", "2026-10-01T09:00:00Z")).toBe(true);
  });

  it("teller ikke egne eller leste meldinger", () => {
    expect(isUnread(at, "seller", "seller", null)).toBe(false);
    expect(isUnread(at, "buyer", "seller", "2026-10-01T11:00:00Z")).toBe(false);
  });
});
