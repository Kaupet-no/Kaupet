import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Eye } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ListingDetailView } from "@/components/listing-detail/listing-detail-view";
import { usePreviewDraft } from "@/features/listing-creation/preview-draft-store";

export const Route = createFileRoute("/_authenticated/ny-annonse/forhandsvisning")({
  component: NyAnnonseForhandsvisning,
});

function NyAnnonseForhandsvisning() {
  const draft = usePreviewDraft();
  const navigate = useNavigate();

  if (!draft) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Ingen forhåndsvisning tilgjengelig</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Gå tilbake til annonseveiviseren og trykk «Forhåndsvis annonse».
        </p>
        <Button className="mt-6" onClick={() => navigate({ to: "/ny-annonse" })}>
          Tilbake til veiviseren
        </Button>
      </div>
    );
  }

  return (
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
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => navigate({ to: "/ny-annonse" })}
          >
            <ArrowLeft className="size-4" /> Tilbake til annonsen
          </Button>
        </div>
      }
    />
  );
}
