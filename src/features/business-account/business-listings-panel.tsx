import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ListChecks, Plus, Upload } from "lucide-react";

import { EmptyState } from "@/components/ui/empty-state";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ListingRow, type Row } from "@/features/my-listings/listing-row";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
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
    staleTime: 30_000,
    queryFn: async (): Promise<Row[]> => {
      let baseQuery = supabase
        .from("listings")
        .select(
          "id, seller_id, kaupet_code, title, status, price_nok, is_free, city, category_id, created_at, expires_at, listing_images(storage_path, sort_order)",
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
        description: null,
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
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"all" | "active" | "draft">("all");
  const listings = listingsQuery.data ?? [];
  const filteredListings = listings.filter((listing) => {
    const matchesStatus = statusFilter === "all" || listing.status === statusFilter;
    const needle = search.trim().toLocaleLowerCase("nb-NO");
    const matchesSearch =
      !needle ||
      listing.title.toLocaleLowerCase("nb-NO").includes(needle) ||
      listing.city?.toLocaleLowerCase("nb-NO").includes(needle);
    return matchesStatus && matchesSearch;
  });

  return (
    <section aria-labelledby="business-listings-title" className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-xl">
          <h2 id="business-listings-title" className="font-display text-3xl tracking-tight">
            Annonser
          </h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            Hold oversikten over det som er publisert og det som gjenstår før publisering.
          </p>
        </div>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          {canCreateListings && (
            <Button asChild className="flex-1 sm:flex-none">
              <Link to="/ny-annonse">
                <Plus className="size-4" aria-hidden="true" />
                Ny annonse
              </Link>
            </Button>
          )}
          {canCreateListings && hasEffectiveProffAccess(organization) && (
            <Button
              type="button"
              variant="outline"
              onClick={onImport}
              className="flex-1 sm:flex-none"
              aria-label="Importer annonser"
            >
              <Upload className="size-4" aria-hidden="true" />
              Importer
            </Button>
          )}
        </div>
      </div>
      {listingsQuery.isLoading ? (
        <div role="status" aria-live="polite">
          <span className="sr-only">Laster annonser…</span>
          <div aria-hidden="true">
            <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
              <Skeleton className="h-10 min-w-0 flex-1" />
              <Skeleton className="h-10 sm:w-44" />
            </div>
            <div className="mt-4 space-y-3">
              {Array.from({ length: 4 }, (_, index) => (
                <div
                  key={index}
                  className="flex min-h-24 items-center gap-3 rounded-xl border border-border bg-card p-4 sm:gap-4 sm:p-5"
                >
                  <Skeleton className="size-14 shrink-0 rounded-lg" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <Skeleton className="h-4 w-2/3" />
                    <Skeleton className="h-3 w-1/3" />
                    <Skeleton className="h-3 w-1/2" />
                  </div>
                  <Skeleton className="size-8 shrink-0 rounded-md" />
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : listingsQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>
            Kunne ikke laste bedriftens annonser. Prøv igjen senere.
          </AlertDescription>
        </Alert>
      ) : listings.length ? (
        <>
          <div className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <label htmlFor="business-listings-search" className="sr-only">
                Søk i annonser
              </label>
              <Input
                id="business-listings-search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Søk etter tittel eller sted"
                className="bg-background"
              />
            </div>
            <div className="sm:w-44">
              <label htmlFor="business-listings-status" className="sr-only">
                Filtrer annonser etter status
              </label>
              <Select
                value={statusFilter}
                onValueChange={(value) => setStatusFilter(value as typeof statusFilter)}
              >
                <SelectTrigger id="business-listings-status" className="bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Alle statuser</SelectItem>
                  <SelectItem value="active">Publisert</SelectItem>
                  <SelectItem value="draft">Utkast</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          {filteredListings.length ? (
            <ul className="space-y-3">
              {filteredListings.map((row) => (
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
              title="Ingen treff"
              description="Prøv et annet søk eller velg en annen status."
              className="p-8 sm:p-10"
            />
          )}
        </>
      ) : (
        <EmptyState
          icon={ListChecks}
          title="Ingen annonser å vise"
          description="Aktive annonser og utkast fra bedriften vises her."
          className="p-8 sm:p-10"
        />
      )}
    </section>
  );
}
