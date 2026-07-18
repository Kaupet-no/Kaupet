import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ChevronRight, PackageSearch } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { CategoryFilterFields, MoreFiltersToggle } from "@/components/category-filter-fields";
import { Collapsible, CollapsibleContent } from "@/components/ui/collapsible";
import { getCategoryIcon } from "@/lib/category-icons";
import { buildTree, descendants, pathFromAncestor, type Category } from "@/lib/categories";
import {
  applyAttributeFilters,
  effectiveFiltersForCategory,
  normalizeFilter,
  setAttributeFilterValue,
  splitPrimaryFilters,
  type AttributeFilterValue,
} from "@/lib/category-filters";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { EmptyState } from "@/components/ui/empty-state";
import { SearchBar } from "@/components/search-bar";
import type { LocationValue } from "@/components/location-filter";

type Props = {
  /** This page's own URL-level category — a main category for /{slug}, or a
   * subcategory for /{main}/{sub}. Drilling deeper (via `subSlug`) never
   * leaves this page — it only changes which descendant is scoped/shown. */
  category: Category;
  /** Breadcrumb chain of *real, distinct URLs* leading to (and including)
   * `category` — [main] or [main, sub]. */
  breadcrumb: Category[];
  /** Slug of a descendant of `category` to scope the page to instead —
   * e.g. from the homepage's category picker drilling past this page's own
   * level (Interiør > Møbler > Sofa still lands on /interiør, with `sub`
   * carrying "sofa"). Ignored if it isn't actually a descendant of `category`. */
  subSlug?: string;
  /** Search param key `subSlug` is read from/written to — "sub" on
   * /{main}, but that name is already a path param on /{main}/{sub}, so that
   * route uses "sub2" instead. */
  subSlugParam: "sub" | "sub2";
  /** Deep-linked filter values, e.g. from the homepage's category picker. */
  initialFilters?: Record<string, AttributeFilterValue>;
  initialPriceMin?: number;
  initialPriceMax?: number;
};

export function CategoryLandingPage({
  category,
  breadcrumb,
  subSlug,
  subSlugParam,
  initialFilters,
  initialPriceMin,
  initialPriceMax,
}: Props) {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [location, setLocation] = useState<LocationValue>({
    lat: null,
    lng: null,
    radius: 50,
    label: "",
  });
  const [filterValues, setFilterValues] = useState<Record<string, AttributeFilterValue>>(
    () => initialFilters ?? {},
  );
  const [priceMin, setPriceMin] = useState<number | undefined>(initialPriceMin);
  const [priceMax, setPriceMax] = useState<number | undefined>(initialPriceMax);

  const { data: categories } = useQuery({
    queryKey: ["categories", "with-color"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id, icon, color")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as Category[];
    },
  });

  const { data: allFilters } = useQuery({
    queryKey: ["category-filters", "all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_filters")
        .select("id, category_id, key, label_nb, type, unit, options, sort_order, is_primary")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const tree = useMemo(() => buildTree(categories ?? []), [categories]);

  // The category actually scoped/shown right now — `category` itself, or one
  // of its descendants when `subSlug` deep-links past this page's own level.
  const selected = useMemo(() => {
    if (!subSlug) return category;
    const found = tree.bySlug.get(subSlug);
    if (!found || found.id === category.id) return category;
    const isDescendant = descendants(category, tree).some((d) => d.id === found.id);
    return isDescendant ? found : category;
  }, [subSlug, category, tree]);

  const extraPath = useMemo(
    () => pathFromAncestor(category, selected, tree),
    [category, selected, tree],
  );
  const breadcrumbEntries = useMemo(() => [...breadcrumb, ...extraPath], [breadcrumb, extraPath]);
  const children = tree.childrenByParent.get(selected.id) ?? [];

  // Selecting a different (deeper/shallower/sibling) category never navigates
  // away from this page's own URL — it only updates the search param.
  const selectCategory = (target: Category) => {
    navigate({
      to: ".",
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        [subSlugParam]: target.id === category.id ? undefined : target.slug,
      }),
    } as never);
  };

  // Reset filters when the scoped category changes (drilling in/out) — a
  // filter configured for "Sofa" rarely makes sense once you're back on
  // "Møbler" — but not on first mount, so a deep-linked `f`/`priceMin` still
  // applies to the initial selection.
  const isFirstRender = useRef(true);
  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    setFilterValues({});
    setPriceMin(undefined);
    setPriceMax(undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected.id]);

  const categoryIds = useMemo(
    () => [selected.id, ...descendants(selected, tree).map((c) => c.id)],
    [selected, tree],
  );
  const filters = useMemo(
    () => effectiveFiltersForCategory(selected.id, allFilters ?? [], tree.byId),
    [selected, allFilters, tree],
  );
  const { primary: primaryFilters, secondary: secondaryFilters } = useMemo(
    () => splitPrimaryFilters(filters),
    [filters],
  );
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(false);

  const { data: listings, isLoading } = useQuery({
    queryKey: ["category-listings", selected.id, filterValues, priceMin, priceMax],
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active")
        .in("category_id", categoryIds);
      qb = applyAttributeFilters(qb, filterValues);
      if (typeof priceMin === "number") qb = qb.gte("price_nok", priceMin);
      if (typeof priceMax === "number") qb = qb.lte("price_nok", priceMax);
      const { data, error } = await qb.order("created_at", { ascending: false }).limit(48);
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          subtitle: l.subtitle,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  const Icon = getCategoryIcon(selected.icon ?? null);
  // Only "hub" main categories carry a presentation color — always the first
  // breadcrumb entry — so the page's tint stays put while drilling deeper.
  const accent = breadcrumb[0]?.color ?? undefined;

  const submitSearch = () => {
    navigate({ to: "/annonser", search: { q, category: selected.slug, sort: "new" } });
  };

  return (
    <div>
      <section
        className="relative overflow-hidden"
        style={accent ? { background: accent } : undefined}
      >
        <div className="absolute inset-0 bg-background/80" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-12">
          <nav aria-label="Brødsmulesti" className="mb-4 flex flex-wrap items-center gap-1 text-sm">
            <Link
              to="/annonser"
              search={{ q: "", category: "", sort: "new" }}
              className="text-muted-foreground hover:text-foreground hover:underline"
            >
              Alle kategorier
            </Link>
            {breadcrumbEntries.map((c, i) => {
              const isLast = i === breadcrumbEntries.length - 1;
              // Entries before this page's own category are real ancestor
              // pages with their own URL; the page's own category and any
              // deeper `sub` selection just update the search param.
              const isAboveOwnCategory = i < breadcrumb.length - 1;
              return (
                <span key={c.id} className="flex items-center gap-1">
                  <ChevronRight className="size-3.5 text-muted-foreground" aria-hidden />
                  {isLast ? (
                    <span className="font-medium">{c.name_nb}</span>
                  ) : isAboveOwnCategory ? (
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
                      onClick={() => selectCategory(c)}
                      className="text-muted-foreground hover:text-foreground hover:underline"
                    >
                      {c.name_nb}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          <div className="flex items-center gap-3">
            <span
              className="flex size-12 items-center justify-center rounded-full text-white"
              style={{ background: accent ?? "var(--primary)" }}
            >
              <Icon className="size-6" />
            </span>
            <h1 className="font-display text-4xl tracking-tight">/{selected.name_nb}</h1>
          </div>
          {children.length > 0 && (
            <div className="mt-4 flex flex-wrap gap-2">
              {children.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => selectCategory(c)}
                  className="rounded-full border border-border bg-card px-3 py-1.5 text-sm transition hover:border-primary hover:text-primary"
                >
                  {c.name_nb}
                </button>
              ))}
            </div>
          )}
          <div className="mt-5 max-w-2xl">
            <SearchBar
              q={q}
              onQChange={setQ}
              onSubmitQ={submitSearch}
              location={location}
              onLocationChange={setLocation}
              selectedSlugs={[]}
              onSelectedChange={() => {}}
              categories={categories ?? []}
              hideCategory
              qMode="all"
              onQModeChange={() => {}}
            />
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl gap-8 px-4 py-8 md:grid md:grid-cols-[240px_1fr]">
        <aside className="mb-6 space-y-5 md:mb-0">
          <p className="text-sm font-medium">Filtrer</p>
          <div className="space-y-2">
            <Label>Pris (kr)</Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Fra"
                value={priceMin ?? ""}
                onChange={(e) =>
                  setPriceMin(e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
              <Input
                type="number"
                placeholder="Til"
                value={priceMax ?? ""}
                onChange={(e) =>
                  setPriceMax(e.target.value === "" ? undefined : Number(e.target.value))
                }
              />
            </div>
          </div>
          {filters.length > 0 && (
            <>
              <CategoryFilterFields
                filters={primaryFilters}
                values={filterValues}
                onChange={(key, v) =>
                  setFilterValues((prev) => setAttributeFilterValue(prev, key, v))
                }
              />
              {secondaryFilters.length > 0 && (
                <Collapsible open={moreFiltersOpen} onOpenChange={setMoreFiltersOpen}>
                  <MoreFiltersToggle open={moreFiltersOpen} />
                  <CollapsibleContent className="space-y-4 pt-4 data-[state=open]:animate-in data-[state=open]:fade-in data-[state=open]:slide-in-from-top-2 data-[state=closed]:animate-out data-[state=closed]:fade-out">
                    <CategoryFilterFields
                      filters={secondaryFilters}
                      values={filterValues}
                      onChange={(key, v) =>
                        setFilterValues((prev) => setAttributeFilterValue(prev, key, v))
                      }
                    />
                  </CollapsibleContent>
                </Collapsible>
              )}
            </>
          )}
          {(Object.keys(filterValues).length > 0 ||
            priceMin !== undefined ||
            priceMax !== undefined) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilterValues({});
                setPriceMin(undefined);
                setPriceMax(undefined);
              }}
            >
              Nullstill filtre
            </Button>
          )}
        </aside>

        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (listings ?? []).length === 0 ? (
            <EmptyState
              icon={PackageSearch}
              title="Ingen annonser i denne kategorien ennå"
              description="Prøv å justere filtrene, eller kom tilbake senere."
            />
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {(listings ?? []).map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
