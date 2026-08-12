import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { CategoryIcon } from "@/lib/category-icons";
import { categoryHeadingFontStack } from "@/lib/category-fonts";
import type { Category } from "@/lib/categories";
import type { BreadcrumbSegment } from "@/lib/category-behavior";
import { encodeAttrFilters } from "@/features/listing-search/search-schema";
import { ScrollArrowRow } from "@/components/scroll-arrow-row";

type Props = {
  /** The category the result set is scoped to — its name is the heading. */
  selected: Category;
  /** The main category `selected` belongs to. Color and heading font are read
   * from it (only main categories carry them), so the tint and typography stay
   * put while the user drills deeper. */
  main?: Category;
  /** Breadcrumb chain from the main category down to (and including) `selected`. */
  breadcrumbEntries: Category[];
  /** Extra brødsmuler appended after `breadcrumbEntries` — e.g. Merke/Modell
   * for a vehicle-category search, mirroring the ad-detail page's breadcrumb
   * so the two page types read as one continuous path. Each links back to
   * /annonser scoped to that filter, except the very last one which is the
   * current page and renders as plain text. */
  extraSegments?: BreadcrumbSegment[];
  /** Subcategories offered as chips below the heading. */
  subcategories: Category[];
  onSelectCategory: (c: Category) => void;
  /** When set, the subcategory chips become multi-select toggles (active
   * state + styling driven by `isActive`/`onToggle`) instead of the default
   * single-select drill via `onSelectCategory` — used on /annonser, where
   * several subcategories can be narrowed to at once. Leaving this unset
   * keeps the original drill-down behavior (category landing pages). */
  subcategorySelection?: {
    isActive: (c: Category) => boolean;
    onToggle: (c: Category) => void;
  };
  /** Breadcrumb entries with an index below this are real category pages with
   * their own URL and render as links; the rest just re-scope the current
   * page. Defaults to 0 (nothing links out). */
  linkUntilIndex?: number;
  /** Tighter vertical padding, for the native app's cramped viewport. */
  compact?: boolean;
  /** Renders the title as a paragraph instead of the page's `h1` — for pages
   * that already have one elsewhere (the native app's page header). */
  headingAs?: "h1" | "p";
  /** Animate the tint, heading and chips in — for when the hero appears in
   * response to the user picking a category, not on first paint. */
  animateIn?: boolean;
};

/**
 * Category header shown above a result set — "/Kategorinavn" over the
 * category's own color, with a breadcrumb and the subcategories as chips for
 * drilling further down. Shared by the category landing pages (where it is
 * the page's own hero) and /annonser (where it animates in once the user
 * picks a category in the filter row).
 */
export function CategoryHero({
  selected,
  main,
  breadcrumbEntries,
  extraSegments = [],
  subcategories,
  onSelectCategory,
  subcategorySelection,
  linkUntilIndex = 0,
  compact = false,
  headingAs: Heading = "h1",
  animateIn = false,
}: Props) {
  const accent = main?.color ?? undefined;
  const anim = animateIn ? "duration-500 animate-in fade-in slide-in-from-right-4" : "";

  return (
    <section
      className="relative overflow-hidden"
      style={accent ? { background: accent } : undefined}
    >
      <div
        className={`absolute inset-0 bg-background/80 ${
          animateIn
            ? "origin-left duration-700 animate-in fade-in slide-in-from-left-8 motion-reduce:animate-none"
            : ""
        }`}
        aria-hidden
      />
      <div className={`relative z-10 mx-auto max-w-7xl px-4 ${compact ? "py-6" : "py-12"}`}>
        <CategoryBreadcrumb
          breadcrumbEntries={breadcrumbEntries}
          extraSegments={extraSegments}
          onSelectCategory={onSelectCategory}
          linkUntilIndex={linkUntilIndex}
        />
        <div
          key={selected.id}
          className={`flex items-center gap-3 motion-reduce:animate-none ${anim}`}
        >
          <span
            className="flex size-12 items-center justify-center rounded-full text-white"
            style={{ background: accent ?? "var(--primary)" }}
          >
            <CategoryIcon iconName={selected.icon} className="size-6" />
          </span>
          <Heading
            className={`tracking-tight ${compact ? "text-3xl" : "text-4xl"}`}
            style={{ fontFamily: categoryHeadingFontStack(main?.heading_font) }}
          >
            /{selected.name_nb}
          </Heading>
        </div>
        {subcategories.length > 0 && (
          <div
            key={`${selected.id}-subs`}
            className={`mt-4 motion-reduce:animate-none ${
              animateIn ? "duration-500 animate-in fade-in slide-in-from-bottom-4" : ""
            }`}
          >
            <ScrollArrowRow>
              {subcategories.map((c) => {
                const active = subcategorySelection?.isActive(c) ?? false;
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() =>
                      subcategorySelection ? subcategorySelection.onToggle(c) : onSelectCategory(c)
                    }
                    className={`shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition ${
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card hover:border-primary hover:text-primary"
                    }`}
                  >
                    {c.name_nb}
                  </button>
                );
              })}
            </ScrollArrowRow>
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * The breadcrumb chain alone, without the color band/heading/subcategory
 * chips — extracted so `/annonser` on native (fase 12) can show "where am I"
 * without the full category hero, which was removed there in favor of the
 * search panel for actual filtering.
 */
export function CategoryBreadcrumb({
  breadcrumbEntries,
  extraSegments = [],
  onSelectCategory,
  linkUntilIndex = 0,
  className,
}: Pick<Props, "breadcrumbEntries" | "extraSegments" | "onSelectCategory" | "linkUntilIndex"> & {
  className?: string;
}) {
  return (
    <nav
      aria-label="Brødsmulesti"
      className={`flex flex-wrap items-center gap-1 text-sm ${className ?? ""}`}
    >
      <Link
        to="/annonser"
        search={{ q: "", category: "", sort: "new" }}
        className="text-muted-foreground hover:text-foreground hover:underline"
      >
        Alle kategorier
      </Link>
      {breadcrumbEntries.map((c, i) => {
        const isLast = extraSegments.length === 0 && i === breadcrumbEntries.length - 1;
        return (
          <span key={c.id} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            {isLast ? (
              <span className="font-medium">{c.name_nb}</span>
            ) : i < linkUntilIndex ? (
              <Link
                to="/$kaupetCode"
                params={{ kaupetCode: c.slug }}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {c.name_nb}
              </Link>
            ) : (
              <button
                type="button"
                onClick={() => onSelectCategory(c)}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {c.name_nb}
              </button>
            )}
          </span>
        );
      })}
      {extraSegments.map((seg, i) => {
        const isLast = i === extraSegments.length - 1;
        return (
          <span key={`extra-${i}`} className="flex items-center gap-1">
            <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
            {isLast ? (
              <span className="font-medium">{seg.name_nb}</span>
            ) : (
              <Link
                to="/annonser"
                search={{
                  q: "",
                  category: seg.slug ?? "",
                  sort: "new",
                  attrs: seg.attrs ? encodeAttrFilters(seg.attrs) : "",
                }}
                className="text-muted-foreground hover:text-foreground hover:underline"
              >
                {seg.name_nb}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}
