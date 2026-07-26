// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useCategoryDrilldown } from "./use-category-drilldown";
import type { CategoryRow } from "@/features/landing/landing-types";

function makeCategory(overrides: Partial<CategoryRow> & { id: string; slug: string }): CategoryRow {
  return {
    name_nb: overrides.slug,
    parent_id: null,
    icon: null,
    color: null,
    heading_font: null,
    search_examples: null,
    ...overrides,
  };
}

const elektronikk = makeCategory({ id: "root-1", slug: "elektronikk" });
const tvOgLyd = makeCategory({ id: "child-1", slug: "tv-og-lyd", parent_id: "root-1" });
const tv = makeCategory({ id: "leaf-1", slug: "tv", parent_id: "child-1" });
const annet = makeCategory({ id: "root-2", slug: "annet" }); // no children -> leaf root

const childrenByParent = new Map<string, CategoryRow[]>([
  ["root-1", [tvOgLyd]],
  ["child-1", [tv]],
]);
const categoriesById = new Map<string, CategoryRow>([
  ["root-1", elektronikk],
  ["child-1", tvOgLyd],
  ["leaf-1", tv],
  ["root-2", annet],
]);

beforeEach(() => {
  // jsdom doesn't implement rAF by default in this environment; the hook
  // only uses it to schedule a scroll-into-view, which isn't under test.
  window.requestAnimationFrame = ((cb: FrameRequestCallback) => {
    cb(0);
    return 0;
  }) as typeof window.requestAnimationFrame;
});

function setup() {
  const navigate = vi.fn();
  const { result } = renderHook(() =>
    useCategoryDrilldown({ childrenByParent, categoriesById, allFilters: [], navigate }),
  );
  return { result, navigate };
}

describe("useCategoryDrilldown", () => {
  it("starts with no category selected", () => {
    const { result } = setup();

    expect(result.current.selectedPath).toEqual([]);
    expect(result.current.activeCategory).toBeNull();
    expect(result.current.currentParent).toBeNull();
  });

  it("handlePickCategory on a leaf root (no children) navigates straight to /annonser", () => {
    const { result, navigate } = setup();

    act(() => result.current.handlePickCategory(annet));

    expect(navigate).toHaveBeenCalledWith({
      to: "/annonser",
      search: { q: "", category: "annet", sort: "new" },
    });
    expect(result.current.selectedPath).toEqual([]);
  });

  it("handlePickCategory on a hub category opens the drilldown panel", () => {
    const { result } = setup();

    act(() => result.current.handlePickCategory(elektronikk));

    expect(result.current.selectedPath).toEqual([elektronikk]);
    expect(result.current.activeCategory).toEqual(elektronikk);
    expect(result.current.categoriesOpen).toBe(true);
  });

  it("clicking the already-active root category again collapses the panel", () => {
    const { result } = setup();
    act(() => result.current.handlePickCategory(elektronikk));

    act(() => result.current.handlePickCategory(elektronikk));

    expect(result.current.selectedPath).toEqual([]);
    expect(result.current.categoriesOpen).toBe(false);
  });

  it("drillIntoSub extends the selected path", () => {
    const { result } = setup();
    act(() => result.current.handlePickCategory(elektronikk));

    act(() => result.current.drillIntoSub(tvOgLyd));

    expect(result.current.selectedPath).toEqual([elektronikk, tvOgLyd]);
    expect(result.current.currentParent).toEqual(tvOgLyd);
  });

  it("goBack steps up one level when more than one level deep", () => {
    const { result } = setup();
    act(() => result.current.handlePickCategory(elektronikk));
    act(() => result.current.drillIntoSub(tvOgLyd));

    act(() => result.current.goBack());

    expect(result.current.selectedPath).toEqual([elektronikk]);
    expect(result.current.categoriesOpen).toBe(true);
  });

  it("goBack closes the panel entirely from the root level", () => {
    const { result } = setup();
    act(() => result.current.handlePickCategory(elektronikk));

    act(() => result.current.goBack());

    expect(result.current.selectedPath).toEqual([]);
    expect(result.current.categoriesOpen).toBe(false);
  });

  it("jumpToDepth truncates the path to the clicked breadcrumb", () => {
    const { result } = setup();
    act(() => result.current.handlePickCategory(elektronikk));
    act(() => result.current.drillIntoSub(tvOgLyd));
    act(() => result.current.drillIntoSub(tv));
    expect(result.current.selectedPath).toHaveLength(3);

    act(() => result.current.jumpToDepth(0));

    expect(result.current.selectedPath).toEqual([elektronikk]);
  });

  it("currentCategoryIds includes the current parent plus all descendants", () => {
    const { result } = setup();
    act(() => result.current.handlePickCategory(elektronikk));

    expect(result.current.currentCategoryIds.sort()).toEqual(["child-1", "leaf-1", "root-1"]);

    act(() => result.current.drillIntoSub(tvOgLyd));

    expect(result.current.currentCategoryIds.sort()).toEqual(["child-1", "leaf-1"]);
  });

  it("goToCategoryPage navigates to the root's own landing page with a `sub` param when drilled deeper", () => {
    const { result, navigate } = setup();

    act(() => result.current.goToCategoryPage([elektronikk, tvOgLyd]));

    expect(navigate).toHaveBeenCalledWith({
      to: "/$kaupetCode",
      params: { kaupetCode: "elektronikk" },
      search: { sub: "tv-og-lyd" },
    });
  });

  it("goToCategoryPage omits the `sub` param when the path is just the root", () => {
    const { result, navigate } = setup();

    act(() => result.current.goToCategoryPage([elektronikk]));

    expect(navigate).toHaveBeenCalledWith({
      to: "/$kaupetCode",
      params: { kaupetCode: "elektronikk" },
      search: {},
    });
  });
});
