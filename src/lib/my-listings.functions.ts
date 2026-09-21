import { createServerFn } from "@tanstack/react-start";

import { getSupabaseServerClient } from "@/integrations/supabase/session.server";
import type { Json } from "@/integrations/supabase/types";
import type { Row } from "@/features/my-listings/listing-row";

/** Som `Row`, men med `attributes` som et konkret JSON-objekt.
 * TanStack Start sin serialiseringskontroll avviser `Record<string, unknown>`
 * (`unknown` er ikke beviselig serialiserbar). Denne formen er serialiserbar
 * OG tilordnbar til `Row`, så ruten slipper en cast. */
export type MyListingRow = Omit<Row, "attributes"> & {
  attributes: { [key: string]: Json | undefined } | null;
};

/** Brukerens egne annonser, hentet på serveren fra kapselsesjonen.
 *
 * Lå tidligere som en useQuery-queryFn i ruten og kjørte i nettleseren mot
 * localStorage-sesjonen — derfor hadde /mine-annonser tom body til dataene
 * kom etter hydrering. Serverklienten er forespørselsavgrenset (se
 * session.server.ts) og leser som brukeren, altså under RLS. */
export const getMyListingRows = createServerFn({ method: "GET" }).handler(
  async (): Promise<MyListingRow[]> => {
    const supabase = getSupabaseServerClient();

    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    if (!userId) return [];

    const { data, error } = await supabase
      .from("listings")
      .select(
        "id, kaupet_code, title, description, category_id, status, price_nok, is_free, attributes, city, created_at, expires_at, listing_images(storage_path, sort_order), categories(slug)",
      )
      .eq("seller_id", userId)
      .order("created_at", { ascending: false });
    if (error) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", error);
    }

    const { data: counts, error: countsError } = await supabase.rpc("my_listing_counts");
    if (countsError) {
      const { toClientError } = await import("@/lib/to-client-error");
      throw await toClientError("database", countsError);
    }

    const countMap = new Map<string, { views: number; favs: number }>();
    for (const c of counts ?? []) {
      countMap.set(c.listing_id, {
        views: Number(c.view_count ?? 0),
        favs: Number(c.favorite_count ?? 0),
      });
    }

    return (data ?? []).map((l) => {
      const cover =
        (l.listing_images ?? []).slice().sort((a, b) => a.sort_order - b.sort_order)[0]
          ?.storage_path ?? null;
      const c = countMap.get(l.id);
      const category = Array.isArray(l.categories) ? l.categories[0] : l.categories;
      return {
        id: l.id,
        kaupet_code: l.kaupet_code,
        title: l.title,
        status: l.status as Row["status"],
        price_nok: l.price_nok,
        is_free: l.is_free,
        city: l.city,
        category_id: l.category_id ?? null,
        category_slug: category?.slug ?? null,
        attributes: (l.attributes ?? null) as { [key: string]: Json | undefined } | null,
        description: l.description ?? null,
        view_count: c?.views ?? 0,
        favorite_count: c?.favs ?? 0,
        created_at: l.created_at,
        expires_at: l.expires_at,
        cover_path: cover,
      };
    });
  },
);
