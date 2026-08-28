import { getCategoryIcon } from "@/lib/category-icons";
import type { CatTree, Category } from "@/lib/categories";
import { hapticImpact } from "@/lib/haptics";
import { ScrollArrowRow } from "@/components/scroll-arrow-row";

type Props = {
  tree: CatTree;
  onSelectRoot: (root: Category) => void;
  isNative?: boolean;
};

/**
 * Always-visible, one-tap main-category selector shown in the hero zone on
 * the search results page before any category is picked — replaces the old
 * "Kategori" dropdown chip that opened a whole drill-down picker behind a
 * popover/sheet. Tapping a category filters to its whole branch immediately,
 * which brings in `CategoryHero` in this same spot (its own subcategory row
 * takes over from there for narrowing further).
 *
 * Styled to match the homepage's category row (icon over label) and, like
 * it, kept to a single scrollable line with side arrows rather than wrapping.
 * A small gap and a slightly wider tile keep long Norwegian category names
 * readable instead of making adjacent labels run together.
 * Hover text/icon color is always white regardless of the category's own tint
 * — varying it per category (picking black or white for contrast) looked
 * inconsistent panel to panel.
 */
export function CategoryChipRow({ tree, onSelectRoot, isNative = false }: Props) {
  const press = () => {
    if (isNative) void hapticImpact("light");
  };

  return (
    <ScrollArrowRow gapClassName="gap-1">
      {tree.roots.map((root) => {
        const Icon = getCategoryIcon(root.icon);
        return (
          <button
            key={root.id}
            type="button"
            onClick={() => {
              press();
              onSelectRoot(root);
            }}
            style={{ "--cat-tint": root.color ?? "var(--primary)" } as React.CSSProperties}
            className="group flex w-24 shrink-0 flex-col items-center gap-1.5 rounded-xl px-2 py-2 text-center transition hover:bg-[var(--cat-tint)]"
          >
            <span className="flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground transition group-hover:bg-transparent group-hover:text-white">
              <Icon className="size-4" />
            </span>
            <span className="flex min-h-[2.25rem] items-start justify-center">
              <span className="line-clamp-2 text-pretty text-xs font-medium leading-tight text-foreground transition group-hover:text-white">
                {root.name_nb}
              </span>
            </span>
          </button>
        );
      })}
    </ScrollArrowRow>
  );
}
