// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { savePendingAuthIntent, takePendingAuthIntent } from "./pending-auth-intent";

describe("pending auth intent", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("is consumed exactly once by the matching listing", () => {
    savePendingAuthIntent({ type: "favorite", listingId: "listing-1" });
    expect(takePendingAuthIntent({ type: "favorite", listingId: "listing-2" })).toBe(false);
    expect(takePendingAuthIntent({ type: "favorite", listingId: "listing-1" })).toBe(true);
    expect(takePendingAuthIntent({ type: "favorite", listingId: "listing-1" })).toBe(false);
  });
});
