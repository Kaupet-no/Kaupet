import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export type WtbPreviewSection = "title" | "category" | "criteria" | "details" | "location";

/**
 * Kjøpsønsket slik selgerne ser det på /ok/$id — samme rekkefølge og
 * overskrifter. Brukes som forhåndsvisning ved siden av skjemaet på desktop og
 * som selve «Se over»-steget. Med `onEdit` blir hver del en knapp som tar
 * brukeren til steget der den fylles ut (samme idé som salgsflytens
 * EditableListingReview: endre det der det står, ikke i en egen oppsummering).
 */
export function WtbListingPreview({
  title,
  categoryLabel,
  criteriaSummary,
  description,
  maxPriceNok,
  locationLabel,
  onEdit,
}: {
  title: string;
  categoryLabel: string | null;
  criteriaSummary: string;
  description: string;
  maxPriceNok: number | null;
  locationLabel: string;
  onEdit?: (section: WtbPreviewSection) => void;
}) {
  return (
    <div className="flex flex-col gap-6 p-4">
      <PreviewPart section="title" label="tittel" onEdit={onEdit}>
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
          Ønskes kjøpt
        </p>
        <h2 className="font-display text-2xl tracking-tight">
          {title.trim() || <span className="text-muted-foreground">Tittel</span>}
        </h2>
      </PreviewPart>

      <PreviewPart section="category" label="kategori" heading="Kategori" onEdit={onEdit}>
        {categoryLabel ? (
          <p>{categoryLabel}</p>
        ) : (
          <p className="text-muted-foreground">Ingen kategori valgt</p>
        )}
      </PreviewPart>

      <PreviewPart section="criteria" label="kriterier" heading="Kriterier" onEdit={onEdit}>
        {criteriaSummary === "Ingen begrensninger" ? (
          <p className="text-sm text-muted-foreground">Ingen spesifikke krav satt</p>
        ) : (
          <p>{criteriaSummary}</p>
        )}
      </PreviewPart>

      <PreviewPart
        section="details"
        label="beskrivelse"
        heading="Beskrivelse / krav"
        onEdit={onEdit}
      >
        {description.trim() ? (
          <p className="whitespace-pre-wrap">{description}</p>
        ) : (
          <p className="text-muted-foreground">Ingen beskrivelse</p>
        )}
      </PreviewPart>

      <PreviewPart
        section="details"
        label="maks pris"
        heading="Maks pris du vil betale"
        previewSection="price"
        onEdit={onEdit}
      >
        {maxPriceNok != null ? (
          <p>{maxPriceNok.toLocaleString("nb-NO")} kr</p>
        ) : (
          <p className="text-muted-foreground">Ikke satt</p>
        )}
      </PreviewPart>

      <PreviewPart section="location" label="område" heading="Område" onEdit={onEdit}>
        {locationLabel ? (
          <p>{locationLabel}</p>
        ) : (
          <p className="text-muted-foreground">Hele landet</p>
        )}
      </PreviewPart>
    </div>
  );
}

function PreviewPart({
  section,
  previewSection = section,
  label,
  heading,
  onEdit,
  children,
}: {
  section: WtbPreviewSection;
  previewSection?: string;
  label: string;
  heading?: string;
  onEdit?: (section: WtbPreviewSection) => void;
  children: ReactNode;
}) {
  const content = (
    <>
      {heading && (
        <span className="block text-sm font-medium text-muted-foreground">{heading}</span>
      )}
      {children}
    </>
  );
  if (!onEdit) {
    return (
      <section data-preview-section={previewSection} className="space-y-2">
        {content}
      </section>
    );
  }
  return (
    <section data-preview-section={previewSection}>
      <button
        type="button"
        onClick={() => onEdit(section)}
        className="native-touch-target group flex w-full items-start gap-2 rounded-md border border-transparent p-2 -m-2 text-left transition-colors hover:border-border focus-visible:border-ring focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <span className="min-w-0 flex-1 space-y-2">{content}</span>
        <span className="flex shrink-0 items-center gap-0.5 text-sm text-primary">
          Endre<span className="sr-only"> {label}</span>
          <ChevronRight className="size-4" aria-hidden />
        </span>
      </button>
    </section>
  );
}
