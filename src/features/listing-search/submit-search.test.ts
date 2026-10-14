import { describe, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/lib/advanced-search-value";
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
  it("flytter prisgrensen til makspris og lar Volvo stå som søkeord", async () => {
    let committed: Record<string, unknown> | undefined;

    await submitSearch({
      query: "Volvo under 300000kr",
      categories: [{ id: "bil-og-mc", slug: "bil-og-mc", name_nb: "Bil og MC", parent_id: null }],
      vehicleBrands: [{ name: "Volvo", category_group: "bil" }],
      commit: (search) => {
        committed = search;
      },
    });

    expect(committed).toMatchObject({
      q: "Volvo",
      categories: ["bil-og-mc"],
      max: 300000,
    });
  });

  // KG-28-F04: «bil» ble fjernet fra teksten og vist som tolket, mens søket beholdt Sofa.
  it("bruker kategorien som vises i tolkningen og fjerner attributter den ikke har", async () => {
    let committed: Record<string, unknown> | undefined;
    await submitSearch({
      applied: {
        value: { ...defaultAdvancedSearchValue(), categories: ["sofa"] },
        attributes: { seats: { kind: "select", value: "3" } },
      },
      query: "bil",
      categories: [
        { id: "sofa", slug: "sofa", name_nb: "Sofa", parent_id: null },
        { id: "bil", slug: "bil", name_nb: "Bil", parent_id: null },
      ],
      commit: (search) => {
        committed = search;
      },
    });
    expect(committed).toMatchObject({ q: "", categories: ["bil"], attrs: "" });
  });

  it("beholder en smalere valgt underkategori når teksten nevner overkategorien", async () => {
    let committed: Record<string, unknown> | undefined;
    let committedCriteria: unknown[] | undefined;
    await submitSearch({
      applied: {
        value: { ...defaultAdvancedSearchValue(), categories: ["elbil"] },
        attributes: { battery_kwh: { kind: "range", min: 60 } },
      },
      query: "bil",
      categories: [
        { id: "bil", slug: "bil", name_nb: "Bil", parent_id: null },
        { id: "elbil", slug: "elbil", name_nb: "Elbil", parent_id: "bil" },
      ],
      commit: (search, criteria) => {
        committed = search;
        committedCriteria = criteria;
      },
    });
    expect(committed).toMatchObject({ categories: ["elbil"] });
    expect(String(committed?.attrs)).toContain("battery_kwh");
    expect(committedCriteria?.some((c) => (c as { kind: string }).kind === "category")).toBe(false);
  });
});
