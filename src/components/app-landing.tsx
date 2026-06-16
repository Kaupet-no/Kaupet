import { useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  Baby,
  Car,
  Dumbbell,
  Gamepad2,
  Home,
  type LucideIcon,
  MapPin,
  Package,
  Palette,
  Search as SearchIcon,
  Ship,
  Shirt,
  Smartphone,
  Sofa,
  Wrench,
  X,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { ListingCard, type ListingCardData } from "@/components/listing-card";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { LocationPicker, RadiusPicker, type LocationValue } from "@/components/location-filter";
import { AnimatedSearchPlaceholder } from "@/components/animated-search-placeholder";
import { useSavedLocation } from "@/lib/use-saved-location";

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  "mobler-og-interior": Sofa,
  elektronikk: Smartphone,
  "klar-og-mote": Shirt,
  "barn-og-baby": Baby,
  "sport-og-friluft": Dumbbell,
  "hus-og-hage": Home,
  "verktoy-og-byggvarer": Wrench,
  "hobby-fritid-og-underholdning": Gamepad2,
  "antikviteter-og-kunst": Palette,
  "deler-bil-og-mc": Car,
  "deler-til-bat": Ship,
  annet: Package,
};

const SUGGESTIONS = [
  "sykkel",
  "sofa",
  "iPhone",
  "kommode",
  "ski",
  "barnevogn",
  "stuebord",
  "kjøleskap",
  "klokke",
  "spillkonsoll",
];

type CategoryRow = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
};

export function AppLanding() {
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [location, setLocation] = useSavedLocation();
  const [locOpen, setLocOpen] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return (data ?? []) as CategoryRow[];
    },
  });

  const rootCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parent_id === null),
    [categories],
  );
  const childrenByParent = useMemo(() => {
    const map = new Map<string, CategoryRow[]>();
    for (const c of categories ?? []) {
      if (!c.parent_id) continue;
      const arr = map.get(c.parent_id) ?? [];
      arr.push(c);
      map.set(c.parent_id, arr);
    }
    return map;
  }, [categories]);

  const { data: popular } = useQuery({
    queryKey: ["popular-listings"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, price_nok, is_free, city, created_at, view_count, listing_images(storage_path, sort_order)",
        )
        .eq("status", "active")
        .order("view_count", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(10);
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

  const submitSearch = (e: React.FormEvent) => {
    e.preventDefault();
    navigate({
      to: "/annonser",
      search: { q: q.trim(), category: "", sort: "new" },
    });
  };

  const pickCategory = (cat: CategoryRow) => {
    const subs = childrenByParent.get(cat.id) ?? [];
    if (subs.length === 0) {
      navigate({
        to: "/annonser",
        search: { q: "", category: cat.slug, sort: "new" },
      });
      return;
    }
    const allSlugs = [cat.slug, ...subs.map((s) => s.slug)];
    navigate({
      to: "/annonser",
      search: {
        q: "",
        category: "",
        categories: allSlugs,
        catMode: "any",
        sort: "new",
      },
    });
  };

  const hasLocation = location.lat != null && location.lng != null;
  const placeholderPaused = focused || q.length > 0;

  return (
    <div className="pb-24">
      {/* Hero — sentrert søkefelt */}
      <section className="flex min-h-[70vh] flex-col items-center justify-center px-5 pt-8">
        <h1 className="mb-6 text-center font-display text-2xl tracking-tight">
          Hva leter du etter i dag?
        </h1>

        <form onSubmit={submitSearch} className="w-full max-w-md">
          <div className="relative">
            <SearchIcon className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder=""
              aria-label="Søk i annonser"
              className="h-14 w-full rounded-full border border-border bg-card pl-12 pr-4 text-base shadow-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/30"
            />
            {!placeholderPaused && (
              <div className="pointer-events-none absolute inset-y-0 left-12 right-4 flex items-center">
                <AnimatedSearchPlaceholder
                  words={SUGGESTIONS}
                  paused={placeholderPaused}
                  className="text-base"
                />
              </div>
            )}
          </div>

          {/* Lokasjon-chip */}
          <div className="mt-4 flex justify-center">
            <Sheet open={locOpen} onOpenChange={setLocOpen}>
              <SheetTrigger asChild>
                <button
                  type="button"
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm transition ${
                    hasLocation
                      ? "border-primary/40 bg-primary/5 text-foreground"
                      : "border-border bg-card text-muted-foreground"
                  }`}
                >
                  <MapPin className="size-4" />
                  <span className="truncate max-w-[200px]">
                    {hasLocation ? `${location.label} · ${location.radius} km` : "Hvor som helst"}
                  </span>
                  {hasLocation && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="ml-1 rounded-full p-0.5 hover:bg-muted"
                      onClick={(e) => {
                        e.stopPropagation();
                        setLocation({
                          lat: null,
                          lng: null,
                          radius: location.radius,
                          label: "",
                        });
                      }}
                      aria-label="Fjern lokasjon"
                    >
                      <X className="size-3.5" />
                    </span>
                  )}
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl">
                <SheetHeader className="text-left">
                  <SheetTitle>Velg sted</SheetTitle>
                </SheetHeader>
                <div className="mt-3 space-y-3">
                  <LocationPicker
                    value={location}
                    onChange={setLocation}
                    onDone={() => setLocOpen(false)}
                  />
                  {hasLocation && (
                    <RadiusPicker
                      value={location.radius}
                      onChange={(r) => setLocation({ ...location, radius: r })}
                    />
                  )}
                </div>
              </SheetContent>
            </Sheet>
          </div>
        </form>
      </section>

      {/* Kategorier */}
      <section className="pt-2 sm:px-5">
        <h2 className="mb-3 px-5 font-display text-lg tracking-tight sm:px-0">Kategorier</h2>

        {/* Mobil: horisontal sveipbar rad */}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-5 pb-2 sm:hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {rootCategories.length === 0 &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-24 w-20 shrink-0 animate-pulse rounded-2xl bg-muted" />
            ))}
          {rootCategories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? Package;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => pickCategory(cat)}
                className="group flex w-20 shrink-0 snap-start flex-col items-center gap-2 active:opacity-80"
              >
                <span className="flex size-16 items-center justify-center rounded-2xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-7" />
                </span>
                <span className="line-clamp-2 text-pretty text-center text-xs font-medium leading-tight">
                  {cat.name_nb}
                </span>
              </button>
            );
          })}
        </div>

        {/* Tablet/desktop: grid */}
        <div className="hidden grid-cols-2 gap-3 sm:grid md:grid-cols-3 lg:grid-cols-4">
          {rootCategories.length === 0 &&
            Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="aspect-[5/4] animate-pulse rounded-2xl bg-muted" />
            ))}
          {rootCategories.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.slug] ?? Package;
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => pickCategory(cat)}
                className="group flex aspect-[5/4] flex-col items-center justify-center gap-2 rounded-2xl border border-border bg-card p-3 text-center transition active:scale-[0.98] hover:border-primary"
              >
                <span className="flex size-11 items-center justify-center rounded-xl bg-primary/10 text-primary transition group-hover:bg-primary group-hover:text-primary-foreground">
                  <Icon className="size-5" />
                </span>
                <span className="text-pretty text-sm font-medium leading-tight">{cat.name_nb}</span>
              </button>
            );
          })}
        </div>
      </section>

      {/* Populært nå */}
      <section className="mt-8 pl-5">
        <div className="mb-3 flex items-center justify-between pr-5">
          <h2 className="font-display text-lg tracking-tight">Populært nå</h2>
          <Link
            to="/annonser"
            search={{ q: "", category: "", sort: "new" }}
            className="text-xs text-primary hover:underline"
          >
            Se alle →
          </Link>
        </div>
        {popular && popular.length > 0 ? (
          <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 pr-5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {popular.map((l) => (
              <div key={l.id} className="w-[60%] shrink-0 snap-start sm:w-[40%]">
                <ListingCard listing={l} />
              </div>
            ))}
          </div>
        ) : (
          <div className="flex gap-3 overflow-hidden pr-5">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="aspect-[4/3] w-[60%] shrink-0 animate-pulse rounded-xl bg-muted"
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
