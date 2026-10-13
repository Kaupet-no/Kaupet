// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";

import type { CategoryFilter } from "@/lib/category-filters";
import { useTextToFilterPipeline } from "./use-text-to-filter-pipeline";

const synonyms = vi.hoisted(() => ({ debouncedQ: "", data: [] as unknown[] }));
vi.mock("./use-search-synonym-matches", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./use-search-synonym-matches")>()),
  useSearchSynonymMatches: () => ({ debouncedQ: synonyms.debouncedQ, data: synonyms.data }),
}));

const equipment: CategoryFilter = {
  id: "equipment",
  category_id: "bil",
  key: "equipment",
  label_nb: "Utstyr",
  type: "multiselect",
  unit: null,
  options: [
    { value: "camera", label_nb: "Kamera" },
    { value: "roof", label_nb: "Soltak" },
  ],
  sort_order: 0,
  is_primary: false,
  depends_on_key: null,
  depends_on_value: null,
  depends_on_not_value: null,
  is_optional: false,
};

const match = (word: number, text: string, value: string) => ({
  startWord: word,
  endWord: word,
  matchedText: text,
  filterKey: "equipment",
  filterLabel: "Utstyr",
  optionValue: value,
  optionLabel: value,
  isAmbiguous: false,
  categoryId: "bil",
});

function run(qDraft: string) {
  const handleAttrValueChange = vi.fn();
  const updateSearch = vi.fn();
  renderHook(() =>
    useTextToFilterPipeline({
      qDraft,
      setQDraft: vi.fn(),
      updateSearch,
      attrFilters: [equipment],
      allFilters: [equipment],
      attrValues: {},
      handleAttrValueChange,
      categoryId: "bil",
    }),
  );
  return { handleAttrValueChange, updateSearch };
}

beforeEach(() => {
  synonyms.debouncedQ = "";
  synonyms.data = [];
});

// KG-28-F01: to verdier for samme filter overskrev hverandre.
it("lagrer flere tolkede verdier for samme filter som én flervalgsverdi", () => {
  synonyms.debouncedQ = "kamera soltak";
  synonyms.data = [match(0, "kamera", "camera"), match(1, "soltak", "roof")];
  const { handleAttrValueChange } = run("kamera soltak");
  expect(handleAttrValueChange).toHaveBeenCalledTimes(1);
  expect(handleAttrValueChange).toHaveBeenCalledWith("equipment", {
    kind: "multiselect",
    values: ["camera", "roof"],
  });
});

// KG-28-F02: et sent svar for «kamera» fjernet ord fra den nyere teksten.
it("bruker ikke et svar som ble beregnet for en eldre søketekst", () => {
  synonyms.debouncedQ = "kamera";
  synonyms.data = [match(0, "kamera", "camera")];
  const { handleAttrValueChange, updateSearch } = run("sofa blå");
  expect(handleAttrValueChange).not.toHaveBeenCalled();
  expect(updateSearch).not.toHaveBeenCalled();
});
