// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useTextToFilterPipeline } from "./use-text-to-filter-pipeline";

vi.mock("./use-search-synonym-matches", async (importOriginal) => {
  const original = await importOriginal<typeof import("./use-search-synonym-matches")>();
  return {
    ...original,
    useSearchSynonymMatches: (_categoryId: string | null, q: string) => ({
      debouncedQ: q,
      data: [
        {
          startWord: 0,
          endWord: 0,
          matchedText: q.includes("rød") ? "rød" : "grønn",
          filterKey: q.includes("rød") ? "color" : "unknown_color",
          optionValue: "green",
          isAmbiguous: false,
          categoryId: null,
        },
        ...(q.includes("lampe")
          ? [
              {
                startWord: 1,
                endWord: 1,
                matchedText: "lampe",
                filterKey: "type",
                optionValue: "lamp",
                isAmbiguous: false,
                categoryId: null,
              },
            ]
          : []),
      ],
    }),
  };
});

describe("useTextToFilterPipeline", () => {
  it("gjør ikke et fargeord om til et kategoriavgrenset filter", () => {
    const updateSearch = vi.fn();
    const handleAttrValueChange = vi.fn();
    renderHook(() =>
      useTextToFilterPipeline({
        qDraft: "rød",
        setQDraft: vi.fn(),
        updateSearch,
        attrFilters: [],
        allFilters: [
          {
            id: "color",
            category_id: "bil",
            key: "color",
            label_nb: "Farge",
            type: "select",
            unit: null,
            options: [{ value: "red", label_nb: "Rød" }],
            sort_order: 0,
            is_primary: true,
            depends_on_key: null,
            depends_on_value: null,
            depends_on_not_value: null,
            is_optional: false,
          },
        ],
        attrValues: {},
        handleAttrValueChange,
        categoryId: null,
      }),
    );
    expect(handleAttrValueChange).not.toHaveBeenCalled();
    expect(updateSearch).not.toHaveBeenCalled();
  });

  it("beholder fritekst når synonymet mangler et gyldig filter", () => {
    const setQDraft = vi.fn();
    const updateSearch = vi.fn();
    const handleAttrValueChange = vi.fn();
    const allFilters = [
      {
        id: "type",
        category_id: "category",
        key: "type",
        label_nb: "Type",
        type: "select" as const,
        unit: null,
        options: [{ value: "lamp", label_nb: "Lampe" }],
        sort_order: 0,
        is_primary: true,
        depends_on_key: null,
        depends_on_value: null,
        depends_on_not_value: null,
        is_optional: false,
      },
    ];
    const base = {
      setQDraft,
      updateSearch,
      attrFilters: [],
      allFilters,
      attrValues: {},
      handleAttrValueChange,
      categoryId: null,
    };

    const { rerender } = renderHook(({ qDraft }) => useTextToFilterPipeline({ ...base, qDraft }), {
      initialProps: { qDraft: "grønn" },
    });
    expect(setQDraft).not.toHaveBeenCalled();
    expect(updateSearch).not.toHaveBeenCalled();

    rerender({ qDraft: "grønn lampe" });
    expect(handleAttrValueChange).toHaveBeenCalledWith("type", {
      kind: "select",
      value: "lamp",
    });
    expect(updateSearch).toHaveBeenCalledWith({ q: "grønn" });
  });
});
