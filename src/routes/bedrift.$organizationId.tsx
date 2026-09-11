import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Building2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ListingCard } from "@/components/listing-card";
import { ProffListingHeader } from "@/components/listing-detail/proff-listing-presentation";
import type { ProffOrganizationPresentation } from "@/components/listing-detail/proff-listing-types";
import { supabase } from "@/integrations/supabase/client";
import { toListingCardData } from "@/lib/listing-card-data";

export const Route = createFileRoute("/bedrift/$organizationId")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("organizations_public")
      .select(
        "id, display_name, organization_number, website_url, logo_path, brand_palette, listing_concept, listing_font, listing_overtitle, has_active_proff",
      )
      .eq("id", params.organizationId)
      .maybeSingle();
    if (error) throw error;
    if (!data || !data.has_active_proff) throw notFound();
    return data;
  },
  head: ({ loaderData }) => ({
    meta: loaderData
      ? [
          { title: `Annonser fra ${loaderData.display_name} — Kaupet.no` },
          {
            name: "description",
            content: `Se aktive annonser fra ${loaderData.display_name} på Kaupet.no.`,
          },
        ]
      : [{ title: "Bedriftens annonser — Kaupet.no" }],
  }),
  component: OrganizationListingsPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-4 py-20 text-center">
      <Building2 className="mx-auto size-10 text-muted-foreground" aria-hidden="true" />
      <h1 className="mt-4 font-display text-2xl">Fant ikke bedriften</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Bedriften har ikke en aktiv Proff-profil eller finnes ikke lenger.
      </p>
      <Button asChild variant="outline" className="mt-6">
        <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
          Se alle annonser
        </Link>
      </Button>
    </div>
  ),
});

function OrganizationListingsPage() {
  const organization = Route.useLoaderData();
  const listingsQuery = useQuery({
    queryKey: ["organization-listings-page", organization.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select(
          "id, kaupet_code, title, subtitle, price_nok, is_free, city, created_at, listing_images(storage_path, sort_order), attributes, categories(slug)",
        )
        .eq("organization_id", organization.id)
        .eq("status", "active")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []).map((row) =>
        toListingCardData(row as Parameters<typeof toListingCardData>[0]),
      );
    },
  });

  const brand: ProffOrganizationPresentation = {
    id: organization.id,
    displayName: organization.display_name,
    organizationNumber: organization.organization_number,
    logoUrl: organization.logo_path
      ? supabase.storage.from("organization-logos").getPublicUrl(organization.logo_path).data
          .publicUrl
      : null,
    websiteUrl: organization.website_url,
    palette: organization.brand_palette,
    concept: organization.listing_concept as ProffOrganizationPresentation["concept"],
    font: organization.listing_font as ProffOrganizationPresentation["font"],
    overtitle: organization.listing_overtitle as ProffOrganizationPresentation["overtitle"],
  };

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:py-12">
      <Button asChild variant="ghost" className="-ml-3 mb-6 min-h-12">
        <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
          <ArrowLeft className="size-4" aria-hidden="true" />
          Tilbake til alle annonser
        </Link>
      </Button>
      <ProffListingHeader organization={brand} heading />
      <section aria-labelledby="organization-listings-page-heading">
        <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Bedriftsprofil
        </p>
        <h2
          id="organization-listings-page-heading"
          className="mt-1 font-display text-3xl tracking-tight"
        >
          Alle annonser fra {brand.displayName}
        </h2>
        {listingsQuery.isPending ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <Skeleton key={index} className="aspect-[4/3] rounded-lg" />
            ))}
          </div>
        ) : listingsQuery.isError ? (
          <p role="alert" className="mt-6 text-sm text-destructive">
            Kunne ikke laste bedriftens annonser. Prøv igjen senere.
          </p>
        ) : listingsQuery.data.length ? (
          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {listingsQuery.data.map((listing) => (
              <ListingCard key={listing.id} listing={listing} />
            ))}
          </div>
        ) : (
          <p className="mt-6 text-sm text-muted-foreground">
            Bedriften har ingen aktive annonser akkurat nå.
          </p>
        )}
      </section>
    </div>
  );
}
