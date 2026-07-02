import { Tag, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";

/**
 * Description textarea. Rendered with a fixed-height flex-fill wrapper on
 * native (its own dedicated page) and plain on web (inline within a larger
 * scrolling page) — matches each platform's original wrapper verbatim.
 *
 * Note: `KeywordChips` below is a *separate* export, not nested inside this
 * component. Native already renders keyword chips directly under the
 * description textarea (unchanged here); web renders them further down,
 * after the condition section — moving them next to the textarea on web
 * would be an unrequested layout change, so the two pieces stay
 * independently positionable by the caller.
 */
export function DescriptionField({
  native,
  register,
  errors,
  touchedFields,
  description,
}: Pick<WizardSharedProps, "native" | "register" | "errors" | "touchedFields" | "description">) {
  const field = (
    <>
      <div className="flex items-center justify-between">
        <Label htmlFor="description">Beskrivelse</Label>
        <div className="flex items-center gap-1.5">
          <FieldValid show={!!touchedFields.description && !errors.description} />
          <span className="text-xs text-muted-foreground">{(description ?? "").length} / 4000</span>
        </div>
      </div>
      <Textarea
        id="description"
        rows={native ? undefined : 5}
        className={native ? "flex-1 resize-none min-h-0" : undefined}
        placeholder="Beskriv tilstand, alder, hvorfor du selger, og om henting/sending."
        aria-invalid={!!errors.description}
        aria-describedby={errors.description ? "description-error" : undefined}
        {...register("description")}
      />
      {errors.description && (
        <p id="description-error" className="text-sm text-destructive">
          {errors.description.message}
        </p>
      )}
    </>
  );

  if (native) {
    return <section className="flex flex-1 flex-col gap-2 min-h-0">{field}</section>;
  }
  return <section className="space-y-2">{field}</section>;
}

/**
 * Keyword-suggestion chips, based on other listings in the same category.
 * `marginTop`: native positions these with `mt-3` right under the
 * description textarea; web has no top margin since it sits in its own
 * section further down the page — preserved verbatim per platform.
 */
export function KeywordChips({
  native,
  categoryId,
  keywordsFetching,
  keywordSuggestions,
  appendTagToDescription,
}: Pick<
  WizardSharedProps,
  "native" | "categoryId" | "keywordsFetching" | "keywordSuggestions" | "appendTagToDescription"
>) {
  if (!categoryId || (!keywordsFetching && !(keywordSuggestions && keywordSuggestions.length > 0)))
    return null;
  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${native ? "mt-3" : ""}`}>
      <Tag className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      {keywordsFetching && (
        <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden />
      )}
      {keywordSuggestions?.map(({ word }) => (
        <button
          key={word}
          type="button"
          onClick={() => appendTagToDescription(word)}
          className="rounded-full border border-border bg-muted px-2 py-0.5 text-xs text-foreground hover:bg-primary/10 hover:border-primary/40 transition-colors"
        >
          {word}
        </button>
      ))}
    </div>
  );
}
