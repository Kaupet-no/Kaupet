// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { getListingDateMeta } from "./listing-detail-view";

describe("annonse-dato på detaljsiden", () => {
  it("viser opprettelsesdato for kladd, ikke publiseringsdato", () => {
    expect(
      getListingDateMeta("draft", null, "2026-09-12T00:00:00Z", "2026-09-12T00:00:00Z"),
    ).toEqual({ label: "Opprettet", dateStr: "12. september 2026" });
  });
});
