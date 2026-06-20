export type TermGroup = {
  id: string;
  mode: "all" | "any";
  exclude: boolean;
  terms: string[];
};

export function emptyTermGroup(exclude = false): TermGroup {
  return {
    id: crypto.randomUUID(),
    mode: "any",
    exclude,
    terms: [],
  };
}

export function describeTermGroup(g: TermGroup): string {
  const verb = g.exclude ? "Skjul" : "Vis kun";
  const qualifier = g.mode === "all" ? "ALLE disse ordene" : "MINST ETT av disse ordene";
  return `${verb} annonser med ${qualifier}`;
}

/** Combines groups that share the same mode + include/exclude setting into a
 * single group (union of their words, duplicates removed), so the applied
 * search never has two lines with identical, hard-to-distinguish behavior. */
export function mergeTermGroups(groups: TermGroup[]): TermGroup[] {
  const merged: TermGroup[] = [];
  const indexByKey = new Map<string, number>();

  for (const g of groups) {
    const key = `${g.mode}|${g.exclude}`;
    const existingIndex = indexByKey.get(key);
    if (existingIndex == null) {
      indexByKey.set(key, merged.length);
      merged.push({ ...g, terms: [...g.terms] });
    } else {
      const existing = merged[existingIndex];
      for (const term of g.terms) {
        if (!existing.terms.includes(term)) existing.terms.push(term);
      }
    }
  }

  return merged;
}
