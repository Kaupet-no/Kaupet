import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import type { Category } from "@/lib/categories";
import type { BreadcrumbSegment } from "@/lib/category-behavior";
import { encodeAttrFilters } from "@/features/listing-search/search-schema";

type Props = {
  /** Chain from the main category down to the current one. */
  breadcrumbEntries: Category[];
  /** Extra brødsmuler appended after `breadcrumbEntries` — e.g. Merke/Modell
   * for a vehicle-category search, mirroring the ad-detail page's breadcrumb
   * so the two page types read as one continuous path. Each links back to
   * /annonser scoped to that filter, except the very last one which is the
   * current page and renders as plain text. */
  extraSegments?: BreadcrumbSegment[];
  onSelectCategory: (c: Category) => void;
  /** Breadcrumb entries with an index below this are real category pages with
   * their own URL and render as links; the rest just re-scope the current
   * page. Defaults to 0 (nothing links out). */
  linkUntilIndex?: number;
};

/**
 * "Where am I" breadcrumb above a search result set — /annonser and the
 * category pages (see SearchResultsPage).
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
