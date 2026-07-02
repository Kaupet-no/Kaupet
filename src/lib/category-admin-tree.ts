// Flattened-tree utilities for the admin category editor's drag-and-drop tree.
// Mirrors the well-known @dnd-kit "sortable tree" example (flatten/getProjection),
// adapted to this app's parent_id/sort_order model instead of a children[] tree.

export type CategoryNode = {
  id: string;
  parent_id: string | null;
  sort_order: number;
};

export type FlattenedCategory<T extends CategoryNode = CategoryNode> = T & {
  depth: number;
};

export const MAX_CATEGORY_DEPTH = 3; // valid depths: 0, 1, 2

function byParentMap<T extends CategoryNode>(categories: T[]): Map<string | null, T[]> {
  const map = new Map<string | null, T[]>();
  for (const c of categories) {
    const arr = map.get(c.parent_id) ?? [];
    arr.push(c);
    map.set(c.parent_id, arr);
  }
  for (const arr of map.values()) arr.sort((a, b) => a.sort_order - b.sort_order);
  return map;
}

/**
 * Flattens a parent_id-linked list into depth-annotated, DFS-ordered items,
 * honoring sort_order for sibling order. Skips descendants of any id in
 * collapsedIds (the collapsed item itself is still included).
 */
export function flattenTree<T extends CategoryNode>(
  categories: T[],
  collapsedIds: Set<string>,
): FlattenedCategory<T>[] {
  const parentMap = byParentMap(categories);
  const result: FlattenedCategory<T>[] = [];

  function walk(parentId: string | null, depth: number) {
    const siblings = parentMap.get(parentId) ?? [];
    for (const item of siblings) {
      result.push({ ...item, depth });
      if (!collapsedIds.has(item.id)) walk(item.id, depth + 1);
    }
  }

  walk(null, 0);
  return result;
}

/** Returns id + all descendant ids (DFS order) rooted at id. */
export function getSubtreeIds<T extends CategoryNode>(categories: T[], id: string): string[] {
  const parentMap = byParentMap(categories);
  const result: string[] = [id];
  function walk(parentId: string) {
    for (const child of parentMap.get(parentId) ?? []) {
      result.push(child.id);
      walk(child.id);
    }
  }
  walk(id);
  return result;
}

/** Depth of a category within the tree (0 for root-level items). */
export function depthOf<T extends CategoryNode>(id: string, categories: T[]): number {
  const byId = new Map(categories.map((c) => [c.id, c]));
  let depth = 0;
  let cur = byId.get(id);
  while (cur?.parent_id) {
    const parent = byId.get(cur.parent_id);
    if (!parent) break;
    depth += 1;
    cur = parent;
  }
  return depth;
}

/** Max depth of the subtree under `id`, relative to `id` itself (0 if leaf). */
export function getSubtreeDepth<T extends CategoryNode>(categories: T[], id: string): number {
  const parentMap = byParentMap(categories);
  function walk(nodeId: string): number {
    const children = parentMap.get(nodeId) ?? [];
    if (children.length === 0) return 0;
    return 1 + Math.max(...children.map((c) => walk(c.id)));
  }
  return walk(id);
}

/** Recursive descendant-id collector (does not include rootId itself). */
export function collectDescendantIds<T extends CategoryNode>(
  categories: T[],
  rootId: string,
): Set<string> {
  const parentMap = byParentMap(categories);
  const result = new Set<string>();
  function walk(parentId: string) {
    for (const child of parentMap.get(parentId) ?? []) {
      result.add(child.id);
      walk(child.id);
    }
  }
  walk(rootId);
  return result;
}

/**
 * Core dnd-kit-sortable-tree "projection" function: given the flattened,
 * currently-visible items (in the order they'll be rendered after a naive
 * arrayMove of active->over), the dragged id, the horizontal pointer offset
 * (dx) since drag start, compute the candidate new depth/parentId.
 *
 * Clamped so that:
 *   - depth never exceeds MAX_CATEGORY_DEPTH - 1
 *   - depth + (subtree depth of dragged item) never exceeds MAX_CATEGORY_DEPTH - 1
 */
export function getProjection<T extends CategoryNode>(
  reorderedFlatItems: FlattenedCategory<T>[],
  activeId: string,
  dragOffsetX: number,
  indentWidth: number,
  categories: T[],
): { depth: number; parentId: string | null } | null {
  const activeIndex = reorderedFlatItems.findIndex((i) => i.id === activeId);
  if (activeIndex === -1) return null;

  const previousItem = reorderedFlatItems[activeIndex - 1] ?? null;
  const nextItem = reorderedFlatItems[activeIndex + 1] ?? null;

  const dragDepthDelta = Math.round(dragOffsetX / indentWidth);
  const currentDepth = reorderedFlatItems[activeIndex].depth;
  let candidateDepth = currentDepth + dragDepthDelta;

  // The item can be at most one level deeper than the previous item (its
  // potential new parent), and at least as deep as the next item (so it
  // doesn't "float" as an orphan sibling of something too shallow).
  const maxDepth = previousItem ? previousItem.depth + 1 : 0;
  const minDepth = nextItem ? nextItem.depth : 0;
  candidateDepth = Math.max(minDepth, Math.min(candidateDepth, maxDepth));

  // Clamp so neither the dragged item nor its subtree exceeds max depth.
  const subtreeDepth = getSubtreeDepth(categories, activeId);
  const hardMax = MAX_CATEGORY_DEPTH - 1 - subtreeDepth;
  candidateDepth = Math.max(0, Math.min(candidateDepth, hardMax));

  if (candidateDepth === 0) return { depth: 0, parentId: null };

  // Find the new parent: walk back from the active item to find the closest
  // preceding item at depth === candidateDepth - 1.
  for (let i = activeIndex - 1; i >= 0; i--) {
    if (reorderedFlatItems[i].depth === candidateDepth - 1) {
      return { depth: candidateDepth, parentId: reorderedFlatItems[i].id };
    }
  }

  return { depth: 0, parentId: null };
}
