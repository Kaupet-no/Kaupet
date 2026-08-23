import { describe, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { submitSearch } from "./submit-search";

vi.mock("./use-search-synonym-matches", async (importOriginal) => {
  const original = await importOriginal<typeof import("./use-search-synonym-matches")>();
  return { ...original, fetchSynonymMatches: vi.fn().mockResolvedValue([]) };
});

describe("submitSearch", () => {
  it("gir alle innganger samme URL og bevarer eksisterende anvendt state", async () => {
    const commits: unknown[] = [];
    const applied = {
      value: {
        ...defaultAdvancedSearchValue(),
        location: { lat: 59.91, lng: 10.75, radius: 25, label: "Oslo" },
      },
      attributes: { condition_note: { kind: "text" as const, value: "pent brukt" } },
    };

    await Promise.all(
      Array.from({ length: 4 }, () =>
        submitSearch({
          applied,
          query: "  Sofa klassiker  ",
          categories: [{ id: "sofa", slug: "sofa", name_nb: "Sofa", parent_id: null }],
          commit: (search) => commits.push(search),
        }),
      ),
    );

    expect(new Set(commits.map((search) => JSON.stringify(search)))).toHaveLength(1);
    expect(commits[0]).toMatchObject({
      q: "klassiker",
      categories: ["sofa"],
      lat: 59.91,
      lng: 10.75,
      radius: 25,
      loc: "Oslo",
      attrs: "condition_note:t:pent%20brukt",
    });
  });
});
