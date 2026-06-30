import { useMemo, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { getCategoryIcon } from "@/lib/category-icons";
import type { Category } from "@/lib/categories";
import {
  applyAttributeFilters,
  effectiveFiltersForCategory,
  normalizeFilter,
  type AttributeFilterValue,
} from "@/lib/category-filters";

export const Route = createFileRoute("/kategori/$slug")({
  head: () => ({ meta: [{ title: "Kategori — Kaupet.no" }] }),
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const [filterValues, setFilterValues] = useState<Record<string, AttributeFilterValue>>({});

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
        .select("id, category_id, key, label_nb, type, unit, options, sort_order")
        .order("sort_order");
      if (error) throw error;
      return (data ?? []).map(normalizeFilter);
    },
  });

  const main = useMemo(
    () => (categories ?? []).find((c) => c.slug === slug && c.parent_id == null),
    [categories, slug],
  );
  const categoriesById = useMemo(() => {
    const m = new Map<string, Category>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);

  const categoryIds = useMemo(() => {
    if (!main) return [];
    const ids = [main.id];
    for (const c of categories ?? []) if (c.parent_id === main.id) ids.push(c.id);
    return ids;
  }, [main, categories]);

  // Filters configured on the main category itself apply to the whole sub-site.
  const filters = useMemo(
    () => effectiveFiltersForCategory(main?.id ?? null, allFilters ?? [], categoriesById),
    [main, allFilters, categoriesById],
  );

  const { data: listings, isLoading } = useQuery({
    queryKey: ["category-listings", main?.id, filterValues],
    enabled: !!main,
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active")
        .in("category_id", categoryIds);
      qb = applyAttributeFilters(qb, filterValues);
      const { data, error } = await qb.order("created_at", { ascending: false }).limit(48);
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          kaupet_code: l.kaupet_code,
          title: l.title,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  if (categories && !main) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-3xl">Fant ikke kategorien</h1>
        <p className="mt-3 text-muted-foreground">Kategorien «{slug}» finnes ikke.</p>
        <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
          <Button className="mt-6">Til alle annonser</Button>
        </Link>
      </div>
    );
  }

  const Icon = getCategoryIcon(main?.icon ?? null);
  const accent = main?.color ?? undefined;

  return (
    <div>
      <section
        className="relative overflow-hidden"
        style={accent ? { background: accent } : undefined}
      >
        <div className="absolute inset-0 bg-background/80" aria-hidden />
        <div className="relative z-10 mx-auto max-w-6xl px-4 py-12">
          <div className="flex items-center gap-3">
            <span
              className="flex size-12 items-center justify-center rounded-full text-white"
              style={{ background: accent ?? "var(--primary)" }}
            >
              <Icon className="size-6" />
            </span>
            <h1 className="font-display text-4xl tracking-tight">{main?.name_nb ?? "Kategori"}</h1>
          </div>
          <Link
            to="/annonser"
            search={{ q: "", category: main?.slug ?? "", sort: "new" }}
            className="mt-3 inline-flex items-center gap-1.5 text-sm text-primary hover:underline"
          >
            <Search className="size-4" /> Søk i alle kategorier
          </Link>
        </div>
      </section>

      <div className="mx-auto max-w-6xl gap-8 px-4 py-8 md:grid md:grid-cols-[16rem_1fr]">
        {/* Category-specific filters */}
        {filters.length > 0 && (
          <aside className="mb-6 space-y-5 md:mb-0">
            <p className="text-sm font-medium">Filtrer</p>
            {filters.map((f) => {
              const current = filterValues[f.key];
              const set = (v: AttributeFilterValue | undefined) =>
                setFilterValues((prev) => {
                  const next = { ...prev };
                  if (v === undefined) delete next[f.key];
                  else next[f.key] = v;
                  return next;
                });

              if (f.type === "boolean") {
                return (
                  <label key={f.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={current?.kind === "boolean" ? current.value : false}
                      onCheckedChange={(c) =>
                        set(c === true ? { kind: "boolean", value: true } : undefined)
                      }
                    />
                    {f.label_nb}
                  </label>
                );
              }
              if (f.type === "select" || f.type === "multiselect") {
                // Both rendered as single-select dropdowns here for simplicity.
                return (
                  <div key={f.id} className="space-y-2">
                    <Label>{f.label_nb}</Label>
                    <Select
                      value={current?.kind === "select" ? current.value : "__all__"}
                      onValueChange={(v) =>
                        set(v === "__all__" ? undefined : { kind: "select", value: v })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all__">Alle</SelectItem>
                        {(f.options ?? []).map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label_nb}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                );
              }
              // number / range / text → min/max for numeric, single field for text
              if (f.type === "text") {
                return (
                  <div key={f.id} className="space-y-2">
                    <Label>{f.label_nb}</Label>
                    <Input
                      value={current?.kind === "text" ? current.value : ""}
                      onChange={(e) =>
                        set(e.target.value ? { kind: "text", value: e.target.value } : undefined)
                      }
                    />
                  </div>
                );
              }
              const range =
                current?.kind === "range" ? current : { min: undefined, max: undefined };
              const updateRange = (patch: { min?: number; max?: number }) => {
                const merged = { min: range.min, max: range.max, ...patch };
                if (merged.min === undefined && merged.max === undefined) return set(undefined);
                set({ kind: "range", min: merged.min, max: merged.max });
              };
              return (
                <div key={f.id} className="space-y-2">
                  <Label>
                    {f.label_nb}
                    {f.unit ? ` (${f.unit})` : ""}
                  </Label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      placeholder="Fra"
                      value={range.min ?? ""}
                      onChange={(e) =>
                        updateRange({
                          min: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                    <Input
                      type="number"
                      placeholder="Til"
                      value={range.max ?? ""}
                      onChange={(e) =>
                        updateRange({
                          max: e.target.value === "" ? undefined : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                </div>
              );
            })}
            {Object.keys(filterValues).length > 0 && (
              <Button variant="outline" size="sm" onClick={() => setFilterValues({})}>
                Nullstill filtre
              </Button>
            )}
          </aside>
        )}

        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : (listings ?? []).length === 0 ? (
            <p className="py-16 text-center text-muted-foreground">
              Ingen annonser i denne kategorien ennå.
            </p>
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
