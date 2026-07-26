import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";

import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";
import { Condition } from "../condition";

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
}: Pick<WizardSharedProps, "register" | "setValue" | "errors" | "knownIssues" | "noKnownIssues">) {
  return (
    <>
      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <Label htmlFor="known_issues">
            Kjente feil og mangler
            {!noKnownIssues && <RequiredMark />}
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
        {!noKnownIssues && (
          <p className="text-xs text-muted-foreground">
            Obligatorisk med mindre du krysser av at kjøretøyet ikke har kjente feil eller mangler.
          </p>
        )}
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
 * Andre av de tre vehicle-only stegene som erstatter det tidligere
 * overbelastede "Beskrivelse"-steget (se UX-audit): tilstandsvurderingen —
 * Tilstand, kjente feil/mangler og vedlikeholdshistorikk samlet i ett kort
 * med egen overskrift, samme visuelle mønster som "Egenskaper"-panelet i
 * attribute-fields.tsx — atskilt fra de "harde faktaene" (`vehicle-facts`) og
 * fritekstbeskrivelsen (`description-keywords`).
 */
export function VehicleConditionGroup(props: WizardSharedProps) {
  return (
    <div className="space-y-4 rounded-xl border border-border p-4">
      <p className="text-sm font-medium">Tilstand og historikk</p>
      <Condition {...props} />
      <VehicleConditionDetails {...props} />
    </div>
  );
}
