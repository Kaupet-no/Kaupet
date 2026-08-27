import { useEffect } from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
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
 * redigeringsruten (som ikke gjenbruker hele TitlePhotos-komponenten) kan
 * bruke samme oppførsel.
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
 * `TitlePhotos` below skips it entirely for `isVehicle` (their title moved to
 * the beskrivelse step, see `VehicleTitleFields` usage in
 * description-keywords/index.tsx), so it no longer needs its own
 * vehicle-vs-generic branch.
 */
export function TitleGroup(
  props: Pick<
    WizardSharedProps,
    "register" | "errors" | "touchedFields" | "title" | "titleExample"
  >,
) {
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
}: Pick<WizardSharedProps, "images" | "setImages" | "uploadProgress">) {
  return (
    <section className="space-y-2">
      <Label>Bilder</Label>
      <p className="text-sm text-muted-foreground">
        Annonser med bilder får mer oppmerksomhet. Vi anbefaler minst 3 bilder.
      </p>
      <p className="text-xs text-muted-foreground">
        Tips: Godt lys, nøytral bakgrunn og bilde av eventuelle feil.
      </p>
      <ImageUploader images={images} onChange={setImages} uploadProgress={uploadProgress} />
    </section>
  );
}

/**
 * Photo upload + (for non-vehicle categories) title. For Bil og MC
 * (`isVehicle`), this step is images only — Tittel/Tilstand/Pris/
 * Kilometerstand all live on the next step (beskrivelse), see
 * description-keywords/index.tsx. Web shows images first then title; native
 * shows title first then images — same content, different order, preserved
 * verbatim from the original per-platform JSX.
 *
 * 360°-opptak lå tidligere her, men bildesteget er nå alltid steg 1 — før
 * kategori er bekreftet — så den valgfrie forbedringen vises på reviewflaten
 * (`field-groups/vehicle-360`).
 */
export function TitlePhotos(props: WizardSharedProps) {
  if (props.native) {
    return (
      <div className="space-y-6">
        {!props.isVehicle && <TitleGroup {...props} />}
        <PhotosGroup {...props} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <PhotosGroup {...props} />
      {!props.isVehicle && <TitleGroup {...props} />}
    </div>
  );
}
