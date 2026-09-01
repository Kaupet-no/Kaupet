import { useQuery } from "@tanstack/react-query";
import { Loader2, ListChecks } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ListingRow, type Row } from "@/features/my-listings/listing-row";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { supabase } from "@/integrations/supabase/client";

type Props = { organization: BusinessOrganization };

type RawListing = {
  id: string;
  kaupet_code: string;
  title: string;
  status: string;
  price_nok: number | null;
  is_free: boolean;
  city: string | null;
  category_id: string | null;
  description: string | null;
  created_at: string;
  expires_at: string | null;
  listing_images: { storage_path: string; sort_order: number }[] | null;
};

export function BusinessListingsPanel({ organization }: Props) {
  const listingsQuery = useQuery({
    queryKey: ["business-listings", organization.id],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, status, price_nok, is_free, city, category_id, description, created_at, expires_at, listing_images(storage_path, sort_order)",
        )
        .eq("organization_id", organization.id)
        .in("status", ["active", "draft"])
        .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RawListing[]).map((listing) => ({
        id: listing.id,
        kaupet_code: listing.kaupet_code,
        title: listing.title,
        status: listing.status as Row["status"],
        price_nok: listing.price_nok,
        is_free: listing.is_free,
        city: listing.city,
        category_id: listing.category_id,
        description: listing.description,
        view_count: 0,
        favorite_count: 0,
        created_at: listing.created_at,
        expires_at: listing.expires_at,
        cover_path:
          listing.listing_images?.slice().sort((a, b) => a.sort_order - b.sort_order)[0]
            ?.storage_path ?? null,
      }));
    },
  });

  return (
    <section aria-labelledby="business-listings-title" className="space-y-5">
      <div>
        <h2 id="business-listings-title" className="font-display text-2xl tracking-tight">
          Annonser
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Aktive annonser og utkast fra bedriften. Åpne en annonse for å redigere den i den vanlige
          annonseflaten.
        </p>
      </div>
      {listingsQuery.isLoading ? (
        <div
          className="flex items-center gap-2 text-sm text-muted-foreground"
          role="status"
          aria-live="polite"
        >
          <Loader2 className="size-4 animate-spin" /> Laster annonser…
        </div>
      ) : listingsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Kunne ikke laste bedriftens annonser. Prøv igjen senere.
          </AlertDescription>
        </Alert>
      ) : listingsQuery.data?.length ? (
        <ul className="space-y-3">
          {listingsQuery.data.map((row) => (
            <ListingRow
              key={row.id}
              row={row}
              isVehicle={false}
              activePromotion={null}
              onPromote={() => undefined}
              onMarkSold={() => undefined}
              onReactivate={() => undefined}
              onRepublish={() => undefined}
              onPublishDraft={() => undefined}
              onDelete={() => undefined}
              busy={false}
              readOnly
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Ingen annonser å vise"
          description="Aktive annonser og utkast fra bedriften vises her."
        />
      )}
    </section>
  );
}
