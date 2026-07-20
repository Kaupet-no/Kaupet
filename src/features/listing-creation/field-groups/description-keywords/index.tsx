import { Tag, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";

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
        <Label htmlFor="description">
          Beskrivelse
          <RequiredMark />
        </Label>
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

/**
 * Undertittel for kjøretøy (Bil og MC) — flyttet hit fra tittel-steget, siden
 * undertittel begrepsmessig hører sammen med beskrivelsen (utstyrsnivå o.l.),
 * ikke med den autogenererte kjøretøy-tittelen.
 */
function SubtitleField({
  register,
  errors,
  subtitle,
}: Pick<WizardSharedProps, "register" | "errors" | "subtitle">) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="subtitle">
          Undertittel <span className="font-normal text-muted-foreground">(valgfritt)</span>
        </Label>
        <span className="text-xs text-muted-foreground">{(subtitle ?? "").length} / 80</span>
      </div>
      <Input
        id="subtitle"
        placeholder="F.eks. Utstyrspakke, modellkode eller annen viktig info"
        aria-invalid={!!errors.subtitle}
        {...register("subtitle")}
      />
      {errors.subtitle && <p className="text-sm text-destructive">{errors.subtitle.message}</p>}
    </section>
  );
}

/**
 * Kjente feil og mangler + vedlikeholdshistorikk — kun for kjøretøy (Bil og
 * MC). Kjente feil og mangler er obligatorisk med mindre "ingen kjente feil
 * eller mangler" er krysset av (håndhevet i registry.ts sin `validateExtra`
 * for denne field group-en).
 */
function VehicleConditionDetails({
  register,
  setValue,
  errors,
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
}: Pick<
  WizardSharedProps,
  "register" | "setValue" | "errors" | "knownIssues" | "noKnownIssues" | "maintenanceHistory"
>) {
  return (
    <>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="known_issues">
            Kjente feil og mangler
            <RequiredMark />
          </Label>
          <span className="text-xs text-muted-foreground">{(knownIssues ?? "").length} / 2000</span>
        </div>
        <Textarea
          id="known_issues"
          rows={3}
          disabled={noKnownIssues}
          placeholder="Beskriv kjente feil eller mangler ved kjøretøyet."
          aria-invalid={!!errors.known_issues}
          {...register("known_issues")}
        />
        {errors.known_issues && (
          <p className="text-sm text-destructive">{errors.known_issues.message}</p>
        )}
        <label className="flex items-center gap-2 text-sm">
          <Checkbox
            checked={!!noKnownIssues}
            onCheckedChange={(v) => {
              const checked = Boolean(v);
              setValue("no_known_issues", checked, { shouldValidate: true });
              if (checked) setValue("known_issues", "", { shouldValidate: true });
            }}
          />
          Ingen kjente feil eller mangler
        </label>
      </section>

      <section className="space-y-2">
        <Label htmlFor="maintenance_history">
          Vedlikeholdshistorikk{" "}
          <span className="font-normal text-muted-foreground">(valgfritt)</span>
        </Label>
        <Textarea
          id="maintenance_history"
          rows={3}
          placeholder="Hvilket vedlikehold er utført, og når?"
          aria-invalid={!!errors.maintenance_history}
          {...register("maintenance_history")}
        />
        {errors.maintenance_history && (
          <p className="text-sm text-destructive">{errors.maintenance_history.message}</p>
        )}
      </section>
    </>
  );
}

/**
 * Registry-facing wrapper: DescriptionField + KeywordChips rendered
 * adjacently. Per the fase-2 field-group wiring decision, the generic
 * per-page rendering renders a field group's pieces together; this changes
 * where KeywordChips sits on web (previously further down, after Condition)
 * but keeps native's existing adjacent layout unchanged.
 *
 * For kjøretøy (`isVehicle`), Undertittel and the feil/mangler +
 * vedlikeholdshistorikk fields are added — see SubtitleField and
 * VehicleConditionDetails above.
 */
export function DescriptionKeywordsGroup(props: WizardSharedProps) {
  return (
    <>
      {props.isVehicle && <SubtitleField {...props} />}
      <DescriptionField {...props} />
      <KeywordChips {...props} />
      {props.isVehicle && <VehicleConditionDetails {...props} />}
    </>
  );
}
