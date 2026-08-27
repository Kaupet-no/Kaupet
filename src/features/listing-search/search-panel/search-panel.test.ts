import { describe, expect, it } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";

import type { SearchPanelResultsContext } from "./search-panel";
import { searchDraftMatchesApplied } from "./search-panel-utils";

function results(): SearchPanelResultsContext {
  return {
    applied: {
      value: defaultAdvancedSearchValue(),
      attributes: {
        brand: { kind: "multiselect", values: ["Volvo"] },
      },
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
        {
          value: { ...applied.applied.value },
          attributes: { brand: { kind: "multiselect", values: ["Volvo"] } },
        },
        applied.applied,
      ),
    ).toBe(true);
  });

  it("rejects a draft after a filter is edited", () => {
    const applied = results();
    expect(
      searchDraftMatchesApplied(
        {
          value: { ...applied.applied.value, includeFree: false },
          attributes: { brand: { kind: "multiselect", values: ["Volvo"] } },
        },
        applied.applied,
      ),
    ).toBe(false);
  });
});
