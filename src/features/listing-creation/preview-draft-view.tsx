import { useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Building2, Monitor, Smartphone, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";
import { ProffListingHeader } from "@/components/listing-detail/proff-listing-presentation";
import type { ListingDetailViewProps } from "@/components/listing-detail/listing-detail-view";
import type { ListingEditContextValue } from "@/features/listing-edit/edit-mode-context";
import type { PreviewDraft } from "@/features/listing-creation/preview-draft-store";
import type { ListingOrganizationBrand } from "@/components/listing-detail/listing-detail-view";
import { useBusinessMembership } from "@/features/business-account/use-business-membership";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useMediaQuery } from "@/hooks/use-media-query";
import { organizationLogoUrl } from "@/lib/organization-logo-url";
import { formatOrganizationNumber } from "@/lib/organization-number";
import { cn } from "@/lib/utils";

function draftDetailProps(draft: PreviewDraft) {
  return {
    title: draft.title,
    subtitle: draft.subtitle,
    description: draft.description,
    priceNok: draft.priceNok,
    isFree: draft.isFree,
    condition: draft.condition,
    canShip: draft.canShip,
    requiresDeliveryMethod: draft.requiresDeliveryMethod,
    city: draft.city,
    postalCode: draft.postalCode,
    displayLat: draft.displayLat,
    displayLng: draft.displayLng,
    createdAt: new Date().toISOString(),
    updatedAt: null,
    publishedAt: null,
    listingStatus: "draft",
    knownIssues: draft.knownIssues,
    noKnownIssues: draft.noKnownIssues,
    maintenanceHistory: draft.maintenanceHistory,
    category: draft.category,
    categoryId: draft.categoryId,
    images: draft.images,
    imgUrls: draft.imgUrls,
    attributes: draft.attributes,
  } satisfies ListingDetailViewProps;
}

const disabledContact = (
  <Button type="button" size="sm" disabled>
    Send melding
  </Button>
);

/**
 * Selgeren slik kjøperne vil se den: bedriften (med Proff-profilering når
 * avtalen er aktiv, som på `$kaupetCode.tsx`) hvis brukeren er medlem av en,
 * ellers egen profil — og bare «Selger» for den som ikke er innlogget.
 * Kontaktknappen er deaktivert — dette er en visning, ikke en annonse.
 */
function usePreviewSeller(): {
  sellerContactSlot: ReactNode;
} {
  const { user } = useAuth();
  const { data: membership } = useBusinessMembership();
  const { data: profile } = useQuery({
    queryKey: ["profile-seller-preview", user?.id],
    enabled: !!user && membership === null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url, created_at")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const organization = membership?.organization;
  const organizationBrand: ListingOrganizationBrand | undefined =
    organization && hasEffectiveProffAccess(organization)
      ? {
          id: organization.id,
          displayName: organization.display_name,
          organizationNumber: organization.organization_number,
          logoUrl: organizationLogoUrl(organization.logo_path),
          websiteUrl: organization.website_url,
          palette: organization.brand_palette,
          concept: organization.listing_concept,
          font: organization.listing_font,
          overtitle: organization.listing_overtitle,
        }
      : undefined;

  const avatar =
    !organization && profile?.avatar_url ? (
      <img src={profile.avatar_url} alt="" className="size-10 rounded-full object-cover" />
    ) : (
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        {organization ? (
          <Building2 className="size-5" aria-hidden />
        ) : (
          <UserRound className="size-5" aria-hidden />
        )}
      </span>
    );

  const identity = organization ? (
    organizationBrand ? (
      <ProffListingHeader organization={organizationBrand} inCard />
    ) : (
      <>
        <p className="font-medium">{organization.display_name}</p>
        <p className="text-sm text-muted-foreground">
          Bedrift · Org.nr. {formatOrganizationNumber(organization.organization_number)}
        </p>
      </>
    )
  ) : (
    <>
      <p className="font-medium">{(user && profile?.display_name) || "Selger"}</p>
      <p className="text-sm text-muted-foreground">Privatperson</p>
      {user && profile?.created_at && (
        <p className="text-xs text-muted-foreground">
          Medlem siden{" "}
          {new Date(profile.created_at).toLocaleDateString("nb-NO", {
            month: "long",
            year: "numeric",
          })}
        </p>
      )}
    </>
  );

  return {
    sellerContactSlot: (
      <div className="space-y-3 rounded-xl border border-border bg-card p-4">
        {organizationBrand ? (
          identity
        ) : (
          <div className="flex items-center gap-3">
            {avatar}
            <div>{identity}</div>
          </div>
        )}
        <Button type="button" className="w-full" disabled>
          {organization ? "Send melding til bedriften" : "Send melding"}
        </Button>
      </div>
    ),
  };
}

/**
 * Hele annonsesiden slik en kjøper på mobil ser den, for telefonrammen ved
 * siden av skjemaet i annonseflyten (se ListingComposerShell sin `preview`).
 */
export function PhoneListingPreview({ draft }: { draft: PreviewDraft }) {
  const seller = usePreviewSeller();
  return (
    <ListingDetailView
      {...draftDetailProps(draft)}
      phonePreview
      stickyContactSlot={disabledContact}
      {...seller}
    />
  );
}

/**
 * Se over-steget: annonsesiden slik kjøperne ser den, i eierens
 * redigeringsmodus — hver del kan klikkes og endres der den står, og
 * `editContext.saveField` skriver til utkastet i stedet for databasen.
 * På desktop kan man bytte mellom desktop- (standard) og mobilversjonen;
 * på smalere skjermer og i appen er mobilversjonen den eneste som gir mening.
 * Kanten rundt redigerbare deler vises bare ved hover/fokus, så siden ligner
 * mest mulig på det kjøperen får.
 */
export function EditableListingReview({
  draft,
  editContext,
  native,
  onEditImages,
}: {
  draft: PreviewDraft;
  editContext: ListingEditContextValue;
  native: boolean;
  onEditImages: () => void;
}) {
  const wide = useMediaQuery("(min-width: 1024px)") && !native;
  const [layout, setLayout] = useState<"desktop" | "mobile">("desktop");
  const seller = usePreviewSeller();
  const framed = wide && layout === "mobile";
  const view = (
    <ListingDetailView
      {...draftDetailProps(draft)}
      phonePreview={!wide || framed}
      editMode={{ context: editContext }}
      stickyContactSlot={framed ? disabledContact : undefined}
      {...seller}
    />
  );

  return (
    <div
      data-testid="listing-review"
      className="space-y-3 [&_[data-editable]:not(:hover):not(:focus-visible)]:border-transparent"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Klikk på en del av annonsen for å endre den.{" "}
          <button
            type="button"
            onClick={onEditImages}
            className="text-foreground underline decoration-dotted underline-offset-4 hover:decoration-solid"
          >
            Endre bilder
          </button>
        </p>
        {wide && (
          <div
            role="group"
            aria-label="Vis annonsen som"
            className="inline-flex rounded-lg bg-muted p-0.5 text-sm"
          >
            {(
              [
                ["desktop", "Desktop", Monitor],
                ["mobile", "Mobil", Smartphone],
              ] as const
            ).map(([value, label, Icon]) => (
              <button
                key={value}
                type="button"
                aria-pressed={layout === value}
                onClick={() => setLayout(value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-3 py-1.5 text-muted-foreground",
                  layout === value && "bg-card font-medium text-foreground shadow-sm",
                )}
              >
                <Icon className="size-4" aria-hidden />
                {label}
              </button>
            ))}
          </div>
        )}
      </div>
      {framed ? (
        <div
          data-phone-frame
          className="mx-auto h-[min(52rem,calc(100dvh-12rem))] w-full max-w-[20rem] overflow-hidden rounded-[2rem] border-[6px] border-foreground bg-background shadow-lg"
        >
          <div className="h-full overflow-y-auto overscroll-contain">{view}</div>
        </div>
      ) : wide ? (
        <div className="overflow-hidden rounded-2xl border border-border bg-background">{view}</div>
      ) : (
        <div className="-mx-4">{view}</div>
      )}
    </div>
  );
}
