import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Search } from "lucide-react";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Button } from "@/components/ui/button";

const searchSchema = z.object({
  q: z.string().optional().default(""),
  category: z.string().optional().default(""),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["new", "price_asc", "price_desc"]).optional().default("new"),
});

export const Route = createFileRoute("/annonser")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Alle annonser — Kaupet.no" },
      {
        name: "description",
        content: "Bla gjennom brukte ting til salgs over hele Norge på Kaupet.no.",
      },
    ],
  }),
  component: BrowsePage,
});

function BrowsePage() {
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/annonser" });
  const [qDraft, setQDraft] = useState(search.q);

  useEffect(() => setQDraft(search.q), [search.q]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings", search],
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select(
          "id, title, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active");

      if (search.q) {
        qb = qb.textSearch("search_vector", search.q, { config: "norwegian" });
      }
      if (search.category) {
        const cat = categories?.find((c) => c.slug === search.category);
        if (cat) qb = qb.eq("category_id", cat.id);
      }
      if (typeof search.min === "number") qb = qb.gte("price_nok", search.min);
      if (typeof search.max === "number") qb = qb.lte("price_nok", search.max);

      if (search.sort === "price_asc") qb = qb.order("price_nok", { ascending: true, nullsFirst: false });
      else if (search.sort === "price_desc") qb = qb.order("price_nok", { ascending: false, nullsFirst: false });
      else qb = qb.order("created_at", { ascending: false });

      const { data, error } = await qb.limit(60);
      if (error) throw error;
      return (data ?? []).map<ListingCardData>((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          title: l.title,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
    enabled: !search.category || !!categories,
  });

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-10">
      <h1 className="font-display text-3xl tracking-tight">Annonser</h1>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          updateSearch({ q: qDraft });
        }}
        className="mt-6 flex flex-wrap gap-3"
      >
        <div className="relative flex-1 min-w-[220px]">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={qDraft}
            onChange={(e) => setQDraft(e.target.value)}
            placeholder="Søk etter f.eks. sykkel, kommode, iPhone…"
            className="pl-9"
          />
        </div>
        <Select
          value={search.category || "all"}
          onValueChange={(v) => updateSearch({ category: v === "all" ? "" : v })}
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Alle kategorier" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle kategorier</SelectItem>
            {(categories ?? []).map((c) => (
              <SelectItem key={c.id} value={c.slug}>
                {c.name_nb}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={search.sort}
          onValueChange={(v) => updateSearch({ sort: v as typeof search.sort })}
        >
          <SelectTrigger className="w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="new">Nyeste først</SelectItem>
            <SelectItem value="price_asc">Pris: lav → høy</SelectItem>
            <SelectItem value="price_desc">Pris: høy → lav</SelectItem>
          </SelectContent>
        </Select>
        <Button type="submit">Søk</Button>
      </form>

      <div className="mt-8">
        {isLoading ? (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (listings ?? []).length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
            <p className="text-lg font-medium">Ingen annonser funnet</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Prøv et bredere søk, eller bli den første til å legge ut noe.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {(listings ?? []).map((l) => (
              <ListingCard key={l.id} listing={l} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
