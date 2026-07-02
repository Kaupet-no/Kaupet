import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { ImageUploader } from "@/components/image-uploader";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";

function TitleSection({
  register,
  errors,
  touchedFields,
  title,
}: Pick<WizardSharedProps, "register" | "errors" | "touchedFields" | "title">) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="title">Tittel</Label>
        <div className="flex items-center gap-1.5">
          <FieldValid show={!!touchedFields.title && !errors.title} />
          <span className="text-xs text-muted-foreground">{(title ?? "").length} / 120</span>
        </div>
      </div>
      <Input
        id="title"
        placeholder="F.eks. Trek Marlin 5 sykkel 2022 — sort, lite brukt"
        aria-invalid={!!errors.title}
        aria-describedby={errors.title ? "title-error" : undefined}
        {...register("title")}
      />
      {errors.title && (
        <p id="title-error" className="text-sm text-destructive">
          {errors.title.message}
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
