import { describe, expect, it } from "vitest";

import {
  buildTree,
  resolveHeroCategory,
  selectAllForParent,
  type Category,
} from "@/lib/categories";

const cat = (
  id: string,
  slug: string,
  name_nb: string,
  parent_id: string | null,
  color?: string,
): Category => ({ id, slug, name_nb, parent_id, color: color ?? null });

// interior (main, colored) > mobler > sofa
// biler (main, colored)
// diverse (root without a color — not a main category)
const categories: Category[] = [
  cat("1", "interior", "Interiør", null, "#123456"),
  cat("2", "mobler", "Møbler", "1"),
  cat("3", "sofa", "Sofa", "2"),
  cat("4", "biler", "Biler", null, "#654321"),
  cat("5", "diverse", "Diverse", null),
  cat("6", "annet", "Annet", "5"),
];
const tree = buildTree(categories);

describe("resolveHeroCategory", () => {
  it("returns nothing when no category is selected", () => {
    expect(resolveHeroCategory([], tree)).toBeNull();
  });

  it("resolves a main category to itself", () => {
    const hero = resolveHeroCategory(["interior"], tree);
    expect(hero?.selected.slug).toBe("interior");
    expect(hero?.main.slug).toBe("interior");
  });

  it("keeps the main category's color when a subcategory is selected", () => {
    const hero = resolveHeroCategory(["mobler"], tree);
    expect(hero?.selected.slug).toBe("mobler");
    expect(hero?.main.slug).toBe("interior");
  });

  it("resolves a whole-branch selection to the branch's top category", () => {
    const hero = resolveHeroCategory(selectAllForParent(tree.bySlug.get("mobler")!, tree), tree);
    expect(hero?.selected.slug).toBe("mobler");
    expect(hero?.main.slug).toBe("interior");
  });

  it("returns nothing for a selection spanning two main categories", () => {
    expect(resolveHeroCategory(["interior", "biler"], tree)).toBeNull();
  });

  it("falls back to the shared ancestor for siblings without their parent selected", () => {
    const withStol = buildTree([...categories, cat("7", "stol", "Stol", "2")]);
    const hero = resolveHeroCategory(["sofa", "stol"], withStol);
    expect(hero?.selected.slug).toBe("mobler");
    expect(hero?.main.slug).toBe("interior");
  });

  it("falls back to the main category for sibling subcategories directly under it", () => {
    const withElektronikk = buildTree([...categories, cat("8", "elektronikk", "Elektronikk", "1")]);
    const hero = resolveHeroCategory(["mobler", "elektronikk"], withElektronikk);
    expect(hero?.selected.slug).toBe("interior");
    expect(hero?.main.slug).toBe("interior");
  });

  it("returns nothing for a root category that isn't a main category", () => {
    expect(resolveHeroCategory(["diverse"], tree)).toBeNull();
    expect(resolveHeroCategory(["annet"], tree)).toBeNull();
  });

  it("returns nothing for an unknown slug", () => {
    expect(resolveHeroCategory(["interior", "finnes-ikke"], tree)).toBeNull();
  });
});
