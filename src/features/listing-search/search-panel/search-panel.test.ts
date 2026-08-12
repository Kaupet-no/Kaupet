import { describe, expect, it } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";

import type { SearchPanelResultsContext } from "./search-panel";
import { searchDraftMatchesApplied } from "./search-panel-utils";

function results(): SearchPanelResultsContext {
  return {
    q: "",
    value: defaultAdvancedSearchValue(),
    attributeValues: {
      brand: { kind: "multiselect", values: ["Volvo"] },
    },
    onApply: () => {},
    resultCount: 42,
  };
}

describe("searchDraftMatchesApplied", () => {
  it("accepts an unchanged draft", () => {
    const applied = results();
    expect(
      searchDraftMatchesApplied(
        { ...applied.value },
        { brand: { kind: "multiselect", values: ["Volvo"] } },
        applied.value,
        applied.attributeValues ?? {},
      ),
    ).toBe(true);
  });

  it("rejects a draft after a filter is edited", () => {
    const applied = results();
    expect(
      searchDraftMatchesApplied(
        { ...applied.value, includeFree: false },
        { brand: { kind: "multiselect", values: ["Volvo"] } },
        applied.value,
        applied.attributeValues ?? {},
      ),
    ).toBe(false);
  });
});
