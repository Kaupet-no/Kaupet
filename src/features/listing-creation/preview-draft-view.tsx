import { useState } from "react";
import { Monitor, Smartphone, UserRound } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";
import type { ListingDetailViewProps } from "@/components/listing-detail/listing-detail-view";
import type { ListingEditContextValue } from "@/features/listing-edit/edit-mode-context";
import type { PreviewDraft } from "@/features/listing-creation/preview-draft-store";
import { useMediaQuery } from "@/hooks/use-media-query";
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

/** Selgeren er generisk i utkastet, så visningen ikke avhenger av profilen,
 * og kontaktknappen er deaktivert — dette er en visning, ikke en annonse. */
const genericSeller = (
  <div className="space-y-3 rounded-xl border border-border bg-card p-4">
    <div className="flex items-center gap-3">
      <span className="grid size-10 place-items-center rounded-full bg-muted text-muted-foreground">
        <UserRound className="size-5" aria-hidden />
      </span>
      <div>
        <p className="font-medium">Selger</p>
        <p className="text-sm text-muted-foreground">Privatperson</p>
      </div>
    </div>
    <Button type="button" className="w-full" disabled>
      Send melding
    </Button>
  </div>
);

/**
 * Hele annonsesiden slik en kjøper på mobil ser den, for telefonrammen ved
 * siden av skjemaet i annonseflyten (se ListingComposerShell sin `preview`).
 */
export function PhoneListingPreview({ draft }: { draft: PreviewDraft }) {
  return (
    <ListingDetailView
      {...draftDetailProps(draft)}
      phonePreview
      stickyContactSlot={disabledContact}
      sellerContactSlot={genericSeller}
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
  const framed = wide && layout === "mobile";
  const view = (
    <ListingDetailView
      {...draftDetailProps(draft)}
      phonePreview={!wide || framed}
      editMode={{ context: editContext }}
      stickyContactSlot={framed ? disabledContact : undefined}
      sellerContactSlot={genericSeller}
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
        <div className="mx-auto h-[min(52rem,calc(100dvh-12rem))] w-full max-w-[20rem] overflow-hidden rounded-[2rem] border-[6px] border-foreground bg-background shadow-lg">
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
