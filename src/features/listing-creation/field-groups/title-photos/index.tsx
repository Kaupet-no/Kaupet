import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronDown, Sparkles } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ImageUploader } from "@/components/image-uploader";
import { computeVehicleTitle } from "@/lib/vehicle/vehicle-title";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";

/**
 * Tittel for kjøretøy-kategorier (de med en `brand_select`-filter, se
 * `vehicleCategoryGroupFor`): tittelen bygges automatisk av Årsmodell/Merke/
 * Modell (fylt av kjøretøyoppslaget eller manuelt valgt i category-
 * attributes-steget, som for disse kategoriene kommer før dette steget).
 * Brukeren kan ikke redigere denne selv — kjøretøyannonser skal alltid ha en
 * tittel generert av kjøretøysopplysningene. Undertittel er flyttet til
 * beskrivelse-steget (`description-keywords`) — se der. Eksportert slik at
 * redigeringsruten (som rendrer feltet direkte, ikke via denne wizard-
 * gruppen) kan bruke samme oppførsel.
 */
export function VehicleTitleFields({
  setValue,
  errors,
  title,
  attributes,
}: Pick<WizardSharedProps, "setValue" | "errors" | "title" | "attributes">) {
  const computedTitle = computeVehicleTitle(attributes);

  useEffect(() => {
    if (computedTitle && computedTitle !== title) {
      setValue("title", computedTitle, { shouldValidate: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computedTitle]);

  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <Label>Tittel</Label>
        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-muted/30 px-3 py-2 text-sm">
          <span className={computedTitle ? "" : "text-muted-foreground"}>
            {computedTitle || "Fylles ut fra Årsmodell, Merke og Modell"}
          </span>
        </div>
        {errors.title && (
          <p id="title-error" className="text-sm text-destructive">
            {errors.title.message}
          </p>
        )}
      </div>
    </section>
  );
}

/**
 * Non-vehicle title input. Vehicle categories never reach this component —
 * `withRuntimeFieldGroups` (category-flows.ts) strips "title" from a
 * vehicle flow's field groups entirely (their title moved to the
 * beskrivelse step, see `VehicleTitleFields` usage in
 * description-keywords/index.tsx), so it no longer needs its own
 * vehicle-vs-generic branch.
 */
export function TitleGroup(
  props: Pick<
    WizardSharedProps,
    "register" | "errors" | "touchedFields" | "title" | "titleExample" | "titleCollapsible"
  >,
) {
  const [opened, setOpened] = useState(false);
  // Sammenslått bak "Jeg vil fylle ut tittel selv" så lenge KI-knappen på
  // bildesiden er hovedvalget — men aldri når feltet har innhold eller en
  // feil som må synes.
  if (props.titleCollapsible && !opened && !props.title && !props.errors.title) {
    return (
      <Button
        type="button"
        variant="ghost"
        className="native-touch-target h-auto w-full justify-between px-0 hover:bg-transparent"
        aria-expanded={false}
        onClick={() => setOpened(true)}
      >
        Jeg vil fylle ut tittel selv
        <ChevronDown className="size-4 shrink-0" aria-hidden />
      </Button>
    );
  }
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="title">
          Tittel
          <RequiredMark />
        </Label>
        <div className="flex items-center gap-1.5">
          <FieldValid show={!!props.touchedFields.title && !props.errors.title} />
          <span className="text-xs text-muted-foreground">{(props.title ?? "").length} / 120</span>
        </div>
      </div>
      <Input
        id="title"
        data-testid="listing-title-input"
        placeholder={`F.eks. ${props.titleExample ?? "Trek Marlin 5 sykkel 2022 — sort, lite brukt"}`}
        aria-required="true"
        aria-invalid={!!props.errors.title}
        aria-describedby={props.errors.title ? "title-error" : undefined}
        // Bare når brukeren nettopp åpnet feltet selv, ikke ved vanlig lasting.
        autoFocus={opened}
        {...props.register("title")}
      />
      {props.errors.title && (
        <p id="title-error" className="text-sm text-destructive">
          {props.errors.title.message}
        </p>
      )}
    </section>
  );
}

export function PhotosGroup({
  images,
  setImages,
  uploadProgress,
  noImageConfirmPending,
  setValue,
  title,
  photoSuggestionEnabled,
  photoSuggestionStatus,
  analyzePhotos,
  photoTitleSuggestion,
  dismissPhotoTitleSuggestion,
}: Pick<
  WizardSharedProps,
  | "images"
  | "setImages"
  | "uploadProgress"
  | "noImageConfirmPending"
  | "setValue"
  | "title"
  | "photoSuggestionEnabled"
  | "photoSuggestionStatus"
  | "analyzePhotos"
  | "photoTitleSuggestion"
  | "dismissPhotoTitleSuggestion"
>) {
  // Brukeren ba om å få tittelen fylt ut: er feltet tomt, brukes forslaget
  // direkte. Har de skrevet noe selv, får de heller velge med "Bruk" under.
  useEffect(() => {
    if (photoTitleSuggestion && !title.trim()) {
      setValue("title", photoTitleSuggestion, { shouldValidate: true });
      dismissPhotoTitleSuggestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [photoTitleSuggestion]);

  return (
    <section className="space-y-2">
      <Label>Legg til bilder</Label>
      <p className="text-sm text-muted-foreground">
        Gode bilder gjør det enklere å vurdere annonsen.
      </p>
      <ImageUploader images={images} onChange={setImages} uploadProgress={uploadProgress} />
      {noImageConfirmPending && images.length === 0 && (
        <p role="status" className="text-sm text-foreground">
          Annonser med bilder får flere henvendelser. Du kan legge til bilder senere.
        </p>
      )}
      {photoSuggestionEnabled && (
        <>
          <div className="space-y-1.5 pt-2">
            <Button
              type="button"
              variant="outline"
              data-testid="photo-suggestion-button"
              className="native-touch-target h-12 w-full gap-2 rounded-xl border-brand/40 text-brand-text hover:text-brand-text"
              onClick={analyzePhotos}
              disabled={images.length === 0 || photoSuggestionStatus === "analyzing"}
              aria-describedby="photo-suggestion-help"
            >
              <Sparkles className="size-4 shrink-0" aria-hidden />
              Fyll ut tittel og kategori for meg
            </Button>
            <p id="photo-suggestion-help" className="text-xs text-muted-foreground">
              {images.length === 0 ? "Legg til minst ett bilde først. " : ""}
              Denne funksjonen benytter KI for å analysere bildene. Les mer om hvordan bildene
              behandles i{" "}
              <Link
                to="/personvern"
                hash="bildeforslag"
                className="underline underline-offset-4 hover:text-foreground"
              >
                personvernerklæringen
              </Link>
              .
            </p>
          </div>
          {photoSuggestionStatus === "analyzing" && (
            <p role="status" className="text-sm text-muted-foreground">
              Analyserer bildene …
            </p>
          )}
          {photoSuggestionStatus === "unavailable" && (
            <p className="text-sm text-muted-foreground">
              Vi fikk dessverre ikke til å analysere bildene nå. Du må fylle ut selv.
            </p>
          )}
          {photoTitleSuggestion && (
            <div className="flex flex-wrap items-center gap-2 rounded-md border border-brand/30 bg-brand/5 px-3 py-2 text-sm">
              <span className="inline-flex items-center gap-1 font-medium text-brand-text">
                <Sparkles className="size-4 shrink-0" aria-hidden />
                Kaupet foreslår tittel: {photoTitleSuggestion}
              </span>
              <Button
                type="button"
                size="sm"
                className="native-touch-target"
                onClick={() => {
                  setValue("title", photoTitleSuggestion, { shouldValidate: true });
                  dismissPhotoTitleSuggestion();
                }}
              >
                Bruk
              </Button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
