import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Loader2, ListChecks } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import { ListingRow, type Row } from "@/features/my-listings/listing-row";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { supabase } from "@/integrations/supabase/client";

type Props = {
  organization: BusinessOrganization;
  locationId: string | "all";
  userId: string;
  listingAccess: "own" | "all";
  listingEditScope: "none" | "own" | "all";
  canCreateListings: boolean;
  onImport: () => void;
};

type RawListing = {
  id: string;
  seller_id: string;
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
export function BusinessListingsPanel({
  organization,
  locationId,
  userId,
  listingAccess,
  listingEditScope,
  canCreateListings,
  onImport,
}: Props) {
  const listingsQuery = useQuery({
    queryKey: ["business-listings", organization.id, userId, listingAccess, locationId],
    queryFn: async (): Promise<Row[]> => {
      let baseQuery = supabase
        .from("listings")
        .select(
          "id, seller_id, kaupet_code, title, status, price_nok, is_free, city, category_id, description, created_at, expires_at, listing_images(storage_path, sort_order)",
        )
        .eq("organization_id", organization.id);
      if (locationId !== "all") {
        baseQuery = baseQuery.eq("organization_location_id", locationId);
      }
      const { data, error } =
        listingAccess === "own"
          ? await baseQuery
              .eq("seller_id", userId)
              .in("status", ["active", "draft"])
              .order("created_at", { ascending: false })
          : await baseQuery
              .in("status", ["active", "draft"])
              .order("created_at", { ascending: false });
      if (error) throw error;
      return ((data ?? []) as unknown as RawListing[]).map((listing) => ({
        id: listing.id,
        seller_id: listing.seller_id,
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
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="business-listings-title" className="font-display text-2xl tracking-tight">
            Annonser
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Aktive annonser og utkast fra bedriften. Åpne en annonse for å redigere den i den
            vanlige annonseflaten.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canCreateListings && (
            <Button asChild variant="outline">
              <Link to="/ny-annonse">Ny annonse</Link>
            </Button>
          )}
          {canCreateListings && hasEffectiveProffAccess(organization) && (
            <Button type="button" onClick={onImport}>
              Importer annonser
            </Button>
          )}
        </div>
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
              readOnly={
                listingEditScope === "none" ||
                (listingEditScope === "own" && row.seller_id !== userId)
              }
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
