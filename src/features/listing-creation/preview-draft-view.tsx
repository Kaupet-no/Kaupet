import { ArrowLeft, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FullscreenOverlay, FullscreenOverlayContent } from "@/components/ui/fullscreen-overlay";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";
import type { PreviewDraft } from "@/features/listing-creation/preview-draft-store";

/**
 * Renders a listing preview draft as a full-page overlay (fixed, scrollable,
 * covers everything below the app header) — same visual weight as
 * ListingDetailView itself, just wrapped so it can be mounted directly inside
 * the wizard instead of behind a router navigation. Going through the router
 * for this (a separate /ny-annonse/forhandsvisning route) used to unmount the
 * whole wizard on open and remount it fresh on close, losing the current step
 * and any state that isn't part of the small localStorage draft (images,
 * category attributes). Rendering it in place, gated by a boolean instead of
 * a URL, keeps the wizard mounted throughout so "close" is just hiding this
 * overlay — nothing is lost and nothing needs restoring.
 */
export function PreviewDraftView({ draft, onClose }: { draft: PreviewDraft; onClose: () => void }) {
  return (
    <FullscreenOverlay open onOpenChange={(next) => !next && onClose()}>
      <FullscreenOverlayContent title="Forhåndsvisning av annonse" className="overflow-y-auto">
        <ListingDetailView
          title={draft.title}
          subtitle={draft.subtitle}
          description={draft.description}
          priceNok={draft.priceNok}
          isFree={draft.isFree}
          condition={draft.condition}
          city={draft.city}
          postalCode={draft.postalCode}
          displayLat={draft.displayLat}
          displayLng={draft.displayLng}
          createdAt={new Date().toISOString()}
          updatedAt={null}
          publishedAt={null}
          knownIssues={draft.knownIssues}
          noKnownIssues={draft.noKnownIssues}
          maintenanceHistory={draft.maintenanceHistory}
          category={draft.category}
          images={draft.images}
          imgUrls={draft.imgUrls}
          attributes={draft.attributes}
          previewBanner={
            <div className="sticky top-0 z-20 -mx-4 mb-4 flex items-center justify-between gap-3 bg-primary/10 px-4 py-2.5 text-sm text-primary">
              <span className="flex items-center gap-2 font-medium">
                <Eye className="size-4" />
                Dette er en forhåndsvisning — annonsen er ikke publisert ennå
              </span>
              <Button type="button" size="sm" variant="ghost" onClick={onClose}>
                <ArrowLeft className="size-4" /> Tilbake til annonsen
              </Button>
            </div>
          }
        />
      </FullscreenOverlayContent>
    </FullscreenOverlay>
  );
}
