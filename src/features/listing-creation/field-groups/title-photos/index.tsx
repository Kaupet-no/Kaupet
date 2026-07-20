import { useEffect, useMemo } from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/image-uploader";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { vehicleCategoryGroupFor, type CategoryNode } from "@/lib/category-filters";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";

/** "bmw" / "BMW" / "iX3" -> "Bmw" / "Bmw" / "Ix3" — first letter upper, rest lower. */
function capitalizeWord(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

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
  const computedTitle = [
    attributes.year,
    capitalizeWord(attributes.brand),
    capitalizeWord(attributes.model),
  ]
    .filter((v) => v !== undefined && v !== null && v !== "")
    .join(" ");

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

function TitleSection(
  props: Pick<
    WizardSharedProps,
    | "register"
    | "setValue"
    | "errors"
    | "touchedFields"
    | "title"
    | "subtitle"
    | "categoryId"
    | "categories"
    | "attributes"
  >,
) {
  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode>();
    for (const c of props.categories) m.set(c.id, c);
    return m;
  }, [props.categories]);
  const vehicleGroup = useMemo(
    () => vehicleCategoryGroupFor(props.categoryId || null, allFilters ?? [], categoriesById),
    [props.categoryId, allFilters, categoriesById],
  );

  if (vehicleGroup) return <VehicleTitleFields {...props} />;

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
        placeholder="F.eks. Trek Marlin 5 sykkel 2022 — sort, lite brukt"
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

function ImagesSection({
  images,
  setImages,
  uploadProgress,
}: Pick<WizardSharedProps, "images" | "setImages" | "uploadProgress">) {
  return (
    <section className="space-y-2">
      <Label>
        Bilder <span className="font-normal text-muted-foreground">(anbefalt — maks 8)</span>
      </Label>
      <ImageUploader images={images} onChange={setImages} uploadProgress={uploadProgress} />
    </section>
  );
}

/**
 * Title + photo upload. Web shows images first then title; native shows title
 * first then images — same content, different order, preserved verbatim from
 * the original per-platform JSX.
 */
export function TitlePhotos(props: WizardSharedProps) {
  if (props.native) {
    return (
      <div className="space-y-6">
        <TitleSection {...props} />
        <ImagesSection {...props} />
      </div>
    );
  }
  return (
    <div className="space-y-6">
      <ImagesSection {...props} />
      <TitleSection {...props} />
    </div>
  );
}
