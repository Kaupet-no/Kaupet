import { Tag, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";
import { VehicleTitleFields } from "../title-photos";
import { Condition } from "../condition";
import { PriceGroup } from "../price";

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

/** Highest mileage a vehicle can report — same cap as the price field, and
 * for the same reason: clamp in the input itself instead of letting the user
 * type past a limit and only finding out afterwards. */
const MAX_MILEAGE_KM = 999_999_999;

/**
 * Kilometerstand — kun for motoriserte kjøretøy (`showMileage`); skjules for
 * campingvogn og tilhenger, som ikke har kilometerteller. Lagres i
 * `attributes.mileage_km`, samme sted den publiserte annonsesiden allerede
 * leser den fra (se src/routes/$kaupetCode.tsx). Formateres som
 * mellomrom-gruppert tall med "km"-etikett, samme mønster som prisfeltet.
 */
function MileageField({
  attributes,
  onAttributesChange,
}: Pick<WizardSharedProps, "attributes" | "onAttributesChange">) {
  const raw = attributes.mileage_km;
  return (
    <section className="space-y-2">
      <Label htmlFor="mileage_km">
        Kilometerstand
        <RequiredMark />
      </Label>
      <div className="relative max-w-[200px]">
        <Input
          id="mileage_km"
          type="text"
          inputMode="numeric"
          placeholder="0"
          className="pr-10 text-right"
          value={formatThousands(raw as string | number | undefined, MAX_MILEAGE_KM)}
          onChange={(e) => {
            const digits = digitsOnlyClamped(e.target.value, MAX_MILEAGE_KM);
            const next = { ...attributes };
            if (digits === "") delete next.mileage_km;
            else next.mileage_km = Number(digits);
            onAttributesChange(next);
          }}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
          km
        </span>
      </div>
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
 * For kjøretøy (`isVehicle`), this step also carries Tittel, Tilstand,
 * Kilometerstand and Pris — moved here from their own steps/field-groups
 * (title-photos is images-only for vehicles; "condition"/"price" are removed
 * entirely from the Bil og MC category flow, see the
 * 20260721130000_bil_og_mc_flow_beskrivelse_step migration) so that step 3
 * of vehicle listing creation is images-only, and everything else about the
 * vehicle (beyond what Statens vegvesen-oppslaget already covers) lives on
 * one "Beskrivelse" step. Order: Tittel, Tilstand, Kilometerstand, Pris,
 * Undertittel, Beskrivelse, nøkkelord, feil/mangler, vedlikeholdshistorikk,
 * Tilstand (sistnevnte flyttet nederst, etter vedlikeholdshistorikk).
 */
export function DescriptionKeywordsGroup(props: WizardSharedProps) {
  return (
    <>
      {props.isVehicle && <VehicleTitleFields {...props} />}
      {props.isVehicle && props.showMileage && <MileageField {...props} />}
      {props.isVehicle && <PriceGroup {...props} />}
      {props.isVehicle && <SubtitleField {...props} />}
      <DescriptionField {...props} />
      <KeywordChips {...props} />
      {props.isVehicle && <VehicleConditionDetails {...props} />}
      {props.isVehicle && <Condition {...props} />}
    </>
  );
}
