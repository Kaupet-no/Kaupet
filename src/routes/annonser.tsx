import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import { Map as MapIcon, Search } from "lucide-react";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";

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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LocationFilter, type LocationValue } from "@/components/location-filter";
import type { MapListing } from "@/components/listings-map";

const ListingsMap = lazy(() =>
  import("@/components/listings-map").then((m) => ({ default: m.ListingsMap })),
);

const searchSchema = z.object({
  q: z.string().optional().default(""),
  category: z.string().optional().default(""),
  min: z.coerce.number().int().min(0).optional(),
  max: z.coerce.number().int().min(0).optional(),
  sort: z.enum(["new", "price_asc", "price_desc"]).optional().default("new"),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  radius: z.coerce.number().min(1).max(100).optional(),
  loc: z.string().optional(),
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
  const [mounted, setMounted] = useState(false);
  const [mobileMapOpen, setMobileMapOpen] = useState(false);

  useEffect(() => setMounted(true), []);
  useEffect(() => setQDraft(search.q), [search.q]);

  const location: LocationValue = useMemo(
    () => ({
      lat: search.lat ?? null,
      lng: search.lng ?? null,
      radius: search.radius ?? 10,
      label: search.loc ?? "",
    }),
    [search.lat, search.lng, search.radius, search.loc],
  );

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

  // If a center+radius is set, fetch matching ids from RPC first
  const { data: radiusIds } = useQuery({
    queryKey: ["listings-radius", search.lat, search.lng, search.radius],
    enabled: search.lat != null && search.lng != null,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("listings_within_radius", {
        center_lat: search.lat!,
        center_lng: search.lng!,
        radius_km: search.radius ?? 10,
      });
      if (error) throw error;
      return (data ?? []).map((r: { id: string }) => r.id);
    },
  });

  const { data: listings, isLoading } = useQuery({
    queryKey: ["listings", search, radiusIds],
    enabled:
      (!search.category || !!categories) &&
      (search.lat == null || search.lng == null || radiusIds != null),
    queryFn: async () => {
      let qb = supabase
        .from("listings")
        .select(
          "id, title, price_nok, is_free, city, lat, lng, created_at, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active");

      if (search.lat != null && search.lng != null) {
        const ids = radiusIds ?? [];
        if (ids.length === 0) return [];
        qb = qb.in("id", ids);
      }

      if (search.q) {
        const terms = search.q
          .trim()
          .split(/\s+/)
          .filter((t: string) => t.length > 0)
          .map((t: string) => t.replace(/[%_,()]/g, " ").trim())
          .filter(Boolean);
        if (terms.length > 0) {
          for (const term of terms) {
            const pattern = `%${term}%`;
            qb = qb.or(
              `title.ilike.${pattern},description.ilike.${pattern},city.ilike.${pattern}`,
            );
          }
        }
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
      return (data ?? []).map((l) => {
        const imgs = (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order);
        return {
          id: l.id,
          title: l.title,
          price_nok: l.price_nok,
          is_free: l.is_free,
          city: l.city,
          lat: l.lat as number | null,
          lng: l.lng as number | null,
          created_at: l.created_at,
          cover_path: imgs[0]?.storage_path ?? null,
        };
      });
    },
  });

  const updateSearch = (patch: Partial<z.infer<typeof searchSchema>>) => {
    navigate({ search: (prev: z.infer<typeof searchSchema>) => ({ ...prev, ...patch }) });
  };

  const handleLocationChange = (v: LocationValue) => {
    updateSearch({
      lat: v.lat ?? undefined,
      lng: v.lng ?? undefined,
      radius: v.lat != null ? v.radius : undefined,
      loc: v.label || undefined,
    });
  };

  const cards: ListingCardData[] = (listings ?? []).map((l) => ({
    id: l.id,
    title: l.title,
    price_nok: l.price_nok,
    is_free: l.is_free,
    city: l.city,
    created_at: l.created_at,
    cover_path: l.cover_path,
  }));

  const mapListings: MapListing[] = (listings ?? [])
    .filter((l): l is typeof l & { lat: number; lng: number } => l.lat != null && l.lng != null)
    .map((l) => ({
      id: l.id,
      title: l.title,
      price_nok: l.price_nok,
      is_free: l.is_free,
      lat: l.lat,
      lng: l.lng,
    }));

  const mapCenter =
    search.lat != null && search.lng != null
      ? { lat: search.lat, lng: search.lng }
      : null;

  const mapNode = mounted ? (
    <Suspense
      fallback={<div className="h-full w-full animate-pulse rounded-xl bg-muted" />}
    >
      <ListingsMap
        center={mapCenter}
        radiusKm={search.radius ?? 10}
        listings={mapListings}
        onCenterChange={(c) =>
          updateSearch({ lat: c.lat, lng: c.lng, radius: search.radius ?? 10, loc: search.loc ?? "Valgt punkt" })
        }
        className="h-full w-full"
      />
    </Suspense>
  ) : (
    <div className="h-full w-full animate-pulse rounded-xl bg-muted" />
  );

  return (
    <div className="mx-auto max-w-7xl px-4 py-10">
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

      <div className="mt-4">
        <LocationFilter value={location} onChange={handleLocationChange} />
      </div>

      <div className="mt-6 lg:hidden">
        <Sheet open={mobileMapOpen} onOpenChange={setMobileMapOpen}>
          <SheetTrigger asChild>
            <Button variant="outline" className="w-full">
              <MapIcon className="size-4" /> Vis kart
            </Button>
          </SheetTrigger>
          <SheetContent side="bottom" className="h-[85vh] p-4">
            <SheetHeader>
              <SheetTitle>Kart</SheetTitle>
            </SheetHeader>
            <div className="mt-4 h-[calc(100%-3rem)]">{mapNode}</div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[1fr_420px]">
        <div>
          {isLoading ? (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="aspect-[4/3] animate-pulse rounded-xl bg-muted" />
              ))}
            </div>
          ) : cards.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-surface p-12 text-center">
              <p className="text-lg font-medium">Ingen annonser funnet</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Prøv et bredere søk eller øk radiusen.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
              {cards.map((l) => (
                <ListingCard key={l.id} listing={l} />
              ))}
            </div>
          )}
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-20 h-[calc(100vh-6rem)] overflow-hidden rounded-xl border border-border">
            {mapNode}
          </div>
        </aside>
      </div>
    </div>
  );
}
