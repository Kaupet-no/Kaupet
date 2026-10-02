// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { renderHook } from "@testing-library/react";
import type { z } from "zod";

import { buildTree, selectAllForParent, type Category } from "@/lib/categories";
import type { searchSchema } from "@/features/listing-search/search-schema";
import { useHeroCategoryActions } from "./use-hero-category-actions";

type SearchPatch = Partial<z.infer<typeof searchSchema>>;

const cat = (
  id: string,
  slug: string,
  name_nb: string,
  parent_id: string | null,
  color?: string,
): Category => ({ id, slug, name_nb, parent_id, color: color ?? null });

// elektronikk (main, farget) > mobil > tilbehor
//                        > lyd
const categories: Category[] = [
  cat("e", "elektronikk", "Elektronikk", null, "#123456"),
  cat("m", "mobil", "Mobil", "e"),
  cat("t", "tilbehor", "Tilbehør", "m"),
  cat("l", "lyd", "Lyd", "e"),
];
const tree = buildTree(categories);
const elektronikk = tree.byId.get("e")!;
const mobil = tree.byId.get("m")!;
const lyd = tree.byId.get("l")!;

function setup(effectiveCategories: string[]) {
  const updates: SearchPatch[] = [];
  const { result } = renderHook(() =>
    useHeroCategoryActions({
      categoryTree: tree,
      effectiveCategories,
      updateSearch: (patch) => updates.push(patch),
    }),
  );
  return { actions: result.current, updates };
}

describe("toggleChildCategory", () => {
  it("narrowing from a lone main-category slug selects only the child branch", () => {
    // Slik et valg fra startflaten på native setter filteret: bare
    // hovedkategoriens slug, som implisitt dekker hele greinen.
    const { actions, updates } = setup(["elektronikk"]);
    actions.toggleChildCategory(elektronikk, mobil);
    expect(updates).toEqual([{ category: "", categories: ["mobil", "tilbehor"], catMode: "any" }]);
  });

  it("tapping an active child again falls back to the whole main branch", () => {
    const { actions, updates } = setup(selectAllForParent(mobil, tree));
    actions.toggleChildCategory(elektronikk, mobil);
    expect(updates).toEqual([
      { category: "", categories: selectAllForParent(elektronikk, tree), catMode: "any" },
    ]);
  });

  it("tapping another child adds it alongside an active one", () => {
    const { actions, updates } = setup(selectAllForParent(mobil, tree));
    actions.toggleChildCategory(elektronikk, lyd);
    expect(updates).toEqual([
      { category: "", categories: ["mobil", "tilbehor", "lyd"], catMode: "any" },
    ]);
  });

  it("deselecting one of two children keeps the other", () => {
    const { actions, updates } = setup([
      ...selectAllForParent(mobil, tree),
      ...selectAllForParent(lyd, tree),
    ]);
    actions.toggleChildCategory(elektronikk, mobil);
    expect(updates).toEqual([{ category: "", categories: ["lyd"], catMode: "any" }]);
  });
});

describe("isChildActive", () => {
  it("is inactive when the whole scope branch is selected", () => {
    const { actions } = setup(selectAllForParent(elektronikk, tree));
    expect(actions.isChildActive(elektronikk, mobil)).toBe(false);
  });

  it("is inactive when a lone main-category slug covers the branch", () => {
    const { actions } = setup(["elektronikk"]);
    expect(actions.isChildActive(elektronikk, mobil)).toBe(false);
  });

  it("is active when only that child branch is selected", () => {
    const { actions } = setup(selectAllForParent(mobil, tree));
    expect(actions.isChildActive(elektronikk, mobil)).toBe(true);
    expect(actions.isChildActive(elektronikk, lyd)).toBe(false);
  });
});
