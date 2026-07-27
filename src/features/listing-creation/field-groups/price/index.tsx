import { useEffect, useState } from "react";
import { Pencil, Search } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

import {
  computeOmregistreringsavgift,
  type AvgiftskodeGruppe,
  type VehicleLeafSlug,
} from "@/lib/vehicle/vehicle-classification";
import { digitsOnlyClamped, formatThousands } from "@/lib/number-input";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { RequiredMark } from "../required-mark";
import { SimilarListings } from "../similar-listings";

/** Highest price a listing can have (matches the `price_nok` Zod schema's
 * `.max()` in ny-annonse.tsx) — enforced here too so the input itself can
 * never produce a value the schema would reject, instead of letting the user
 * type past it and only finding out from a validation error afterwards. */
const MAX_PRICE_NOK = 999_999_999;

/**
 * Pris (price) + "gis bort gratis" + WTB-treff-hint. The WTB hint used to be
 * web-only; per the approved native-gap fix it now renders on both platforms
 * since it only depends on category_id + price_nok, not on anything
 * platform-specific.
 *
 * For kjøretøy also shows the omregistreringsavgift (re-registration fee) the
 * *buyer* pays to the state on ownership transfer, alongside a read-only
 * "Pris synlig i annonse" field right next to the price input — priceNok +
 * the fee, i.e. exactly the number a buyer will see on the published
 * listing, visible at a glance rather than buried in a paragraph below. The
 * calculated fee defaults from `computeOmregistreringsavgift`, but the seller
 * can override it (stored in `attributes.omregistreringsavgift_override_kr`)
 * if they believe it's wrong — e.g. our SVV-derived weight/age is off, or a
 * fritak/exemption applies we don't model. The override is never re-derived
 * server-side, so the seller is told plainly that they're responsible for it
 * being correct.
 */
export function Price({
  register,
  errors,
  touchedFields,
  isFree,
  setValue,
  priceNok,
  wtbMatch,
  isVehicle,
  vehicleClassification,
  vehicleLookupResult,
  attributes,
  onAttributesChange,
}: WizardSharedProps) {
  const [editingAvgift, setEditingAvgift] = useState(false);
  const calculatedAvgiftKr = isVehicle
    ? computeOmregistreringsavgift(
        (vehicleClassification?.slug as VehicleLeafSlug) ?? null,
        vehicleLookupResult?.weight_kg ?? null,
        vehicleLookupResult?.first_registration_date
          ? Number(vehicleLookupResult.first_registration_date.slice(0, 4))
          : null,
        (attributes.avgiftskode_gruppe as AvgiftskodeGruppe | undefined) ?? null,
      )
    : null;
  const avgiftOverrideRaw = attributes.omregistreringsavgift_override_kr;
  const avgiftOverrideKr = typeof avgiftOverrideRaw === "number" ? avgiftOverrideRaw : null;
  const omregistreringsavgiftKr = avgiftOverrideKr ?? calculatedAvgiftKr;
  const avgiftFritatt = attributes.omregistreringsavgift_fritatt === true;
  const avgiftInkludert = attributes.omregistreringsavgift_inkludert === true;
  const setAvgiftFritatt = (checked: boolean) => {
    const next = { ...attributes };
    if (checked) {
      next.omregistreringsavgift_fritatt = true;
      delete next.omregistreringsavgift_inkludert;
    } else {
      delete next.omregistreringsavgift_fritatt;
    }
    onAttributesChange(next);
  };
  const setAvgiftInkludert = (checked: boolean) => {
    const next = { ...attributes };
    if (checked) {
      next.omregistreringsavgift_inkludert = true;
      delete next.omregistreringsavgift_fritatt;
    } else {
      delete next.omregistreringsavgift_inkludert;
    }
    onAttributesChange(next);
  };
  // Avgiften kjøper faktisk betaler i tillegg til kjøpesummen — null når
  // fritatt (ingen avgift) eller inkludert i kjøpesummen (allerede betalt av
  // selger), selv om det beregnede/overstyrte beløpet fortsatt vises
  // informativt i avgift-boksen under.
  const avgiftAddedOnTopKr = avgiftFritatt || avgiftInkludert ? null : omregistreringsavgiftKr;
  // `priceNok` isn't reliably a clean `number` — react-hook-form's blur
  // handling (and other internal syncing) can end up re-reading it from a
  // DOM/string representation, which for this field is the space-formatted
  // display value ("200 000", with an nb-NO non-breaking space). A strict
  // `Number(priceNok)` breaks on that space and silently produces NaN → this
  // whole vehicle section disappearing. Parse it the same tolerant way
  // `formatThousands` displays it: strip everything but digits first, then
  // convert — so a stray space/formatting artifact never breaks this.
  const priceNumeric = (() => {
    if (typeof priceNok === "number") return priceNok;
    if (typeof priceNok !== "string") return null;
    const digits = priceNok.replace(/[^\d]/g, "");
    return digits === "" ? null : Number(digits);
  })();
  // "Pris synlig i annonse" stays visible whenever there's a price to show,
  // even when fritatt/inkludert means nothing gets added on top — it's still
  // useful confirmation of exactly what the buyer will see, not just a
  // conditional add-on display.
  const totalprisKr =
    !isFree && priceNumeric != null ? priceNumeric + (avgiftAddedOnTopKr ?? 0) : null;
  // The *listing's displayed total* (price + avgift) must never exceed
  // MAX_PRICE_NOK, so the price input's own ceiling is lowered by whatever
  // fee is currently in play — otherwise a seller could type a price that,
  // once the fee is added, shows a "Pris synlig i annonse" above the cap.
  // No reduction when fritatt/inkludert, since nothing gets added on top.
  const maxPriceInputKr =
    avgiftAddedOnTopKr != null ? Math.max(0, MAX_PRICE_NOK - avgiftAddedOnTopKr) : MAX_PRICE_NOK;
  // Clamps down an already-typed price if the avgift only becomes known (or
  // grows) afterwards — e.g. a registration lookup resolving after the
  // seller already entered a price — so the total can never drift past
  // MAX_PRICE_NOK just because the input's max wasn't this tight yet when it
  // was typed.
  useEffect(() => {
    if (priceNumeric != null && priceNumeric > maxPriceInputKr) {
      setValue("price_nok", maxPriceInputKr, { shouldValidate: true, shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [maxPriceInputKr]);
  const priceField = register("price_nok");
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Label>
          Pris
          <RequiredMark />
        </Label>
        <FieldValid
          show={
            (!!touchedFields.price_nok || isFree) &&
            !errors.price_nok &&
            (isFree || typeof priceNok === "number")
          }
        />
      </div>
      <div className="flex items-end gap-3">
        <div className="space-y-1">
          <div className="relative max-w-[200px]">
            <Input
              type="text"
              inputMode="numeric"
              placeholder="0"
              disabled={isFree}
              className="pr-9 text-right"
              aria-invalid={!!errors.price_nok}
              aria-describedby={errors.price_nok ? "price-error" : undefined}
              // Only `name`/`ref` from register() — NOT the full spread.
              // register()'s `onBlur` reads the value straight off the DOM
              // node on blur (its uncontrolled-field fallback sync), which
              // here is the space-formatted display string ("200 000", with
              // an nb-NO non-breaking space) rather than the clean number we
              // write via setValue below. That formatted string then became
              // price_nok itself, `Number("200 000")` is NaN, and this whole
              // vehicle section quietly disappeared the moment the field
              // blurred — e.g. by clicking into Beskrivelse right after.
              name={priceField.name}
              ref={priceField.ref}
              value={formatThousands(priceNok, maxPriceInputKr)}
              onChange={(e) => {
                const digits = digitsOnlyClamped(e.target.value, maxPriceInputKr);
                setValue("price_nok", digits === "" ? "" : Number(digits), {
                  shouldValidate: true,
                  shouldDirty: true,
                  shouldTouch: true,
                });
              }}
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
              kr
            </span>
          </div>
        </div>
        {isVehicle && totalprisKr != null && (
          <div className="space-y-1">
            <Label htmlFor="price-visible-in-listing" className="text-xs text-muted-foreground">
              Pris synlig i annonse
            </Label>
            <Input
              id="price-visible-in-listing"
              disabled
              className="max-w-[200px] text-muted-foreground"
              value={`${totalprisKr.toLocaleString("nb-NO")} kr`}
            />
          </div>
        )}
        {!isVehicle && (
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isFree} onCheckedChange={(v) => setValue("is_free", Boolean(v))} />
            Gis bort gratis
          </label>
        )}
      </div>
      {errors.price_nok && (
        <p id="price-error" className="text-sm text-destructive">
          {errors.price_nok.message as string}
        </p>
      )}
      {isVehicle && (
        <div className="space-y-2 rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">
              Omregistreringsavgift {avgiftOverrideKr != null && "(endret av deg)"}
            </span>
            {avgiftFritatt ? (
              <span className="font-medium text-foreground">Fritatt</span>
            ) : editingAvgift ? (
              <Input
                type="number"
                min={0}
                autoFocus
                className="h-7 max-w-[110px] text-xs"
                value={omregistreringsavgiftKr ?? ""}
                onChange={(e) => {
                  const v = e.target.value;
                  const next = { ...attributes };
                  if (v === "") delete next.omregistreringsavgift_override_kr;
                  else next.omregistreringsavgift_override_kr = Number(v);
                  onAttributesChange(next);
                }}
                onBlur={() => setEditingAvgift(false)}
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingAvgift(true)}
                className="flex items-center gap-1 font-medium text-foreground hover:text-primary"
              >
                {omregistreringsavgiftKr != null
                  ? `${omregistreringsavgiftKr.toLocaleString("nb-NO")} kr`
                  : "Ikke beregnet — sett beløp"}
                <Pencil className="size-3" aria-hidden />
              </button>
            )}
          </div>
          {!avgiftFritatt && omregistreringsavgiftKr == null && (
            <p className="text-muted-foreground">
              Vi klarte ikke å beregne avgiften automatisk. Dette kan for eksempel skje dersom
              kjøretøyet ikke ble funnet hos Statens Vegvesen. Sett beløpet selv over.
            </p>
          )}
          {!avgiftFritatt && avgiftOverrideKr != null && calculatedAvgiftKr != null && (
            <div className="flex items-center justify-between gap-2 text-muted-foreground">
              <span>Beregnet av Kaupet</span>
              <div className="flex items-center gap-2">
                <span>{calculatedAvgiftKr.toLocaleString("nb-NO")} kr</span>
                <Button
                  type="button"
                  variant="link"
                  className="h-auto p-0 text-xs"
                  onClick={() => {
                    const next = { ...attributes };
                    delete next.omregistreringsavgift_override_kr;
                    onAttributesChange(next);
                  }}
                >
                  Tilbakestill
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-1.5 border-t border-border pt-2">
            <label className="flex items-center gap-2">
              <Checkbox
                checked={avgiftFritatt}
                onCheckedChange={(v) => setAvgiftFritatt(Boolean(v))}
              />
              Fritatt omregistreringsavgift
            </label>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={avgiftInkludert}
                onCheckedChange={(v) => setAvgiftInkludert(Boolean(v))}
              />
              Omregistreringsavgift er inkludert i kjøpesummen (selger er ansvarlig for
              omregistrering)
            </label>
          </div>

          {!avgiftFritatt && !avgiftInkludert && (
            <p className="text-muted-foreground">
              Betales av kjøper til staten ved eierskifte, og kommer i tillegg til kjøpesummen du
              angir. Du kan endre beløpet dersom du mener det er feil. Du selv er ansvarlig for at
              beløpet som oppgis er korrekt.
            </p>
          )}
          {avgiftInkludert && (
            <p className="text-muted-foreground">
              Kjøper betaler da ikke noe ekstra ved eierskifte — du er selv ansvarlig for å
              registrere eierskiftet og betale avgiften.
            </p>
          )}
          <p className="text-muted-foreground">
            Du kan sjekke satsene selv hos{" "}
            <a
              href="https://www.skatteetaten.no/person/avgifter/bil/eierskifte/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-foreground"
            >
              Skatteetaten
            </a>
            .
          </p>
        </div>
      )}
      {wtbMatch && wtbMatch.count > 0 && (
        <div className="flex items-start gap-2 rounded-lg border border-primary/30 bg-primary/5 px-3 py-2.5 text-sm">
          <Search className="mt-0.5 size-4 shrink-0 text-primary" />
          <div>
            <span className="font-medium">
              {wtbMatch.count === 1
                ? "1 bruker ønsker å kjøpe noe lignende"
                : `${wtbMatch.count} brukere ønsker å kjøpe noe lignende`}
            </span>
            {wtbMatch.maxPrice != null && (
              <span className="text-muted-foreground">
                {" "}
                — høyeste budsjett{" "}
                <span className="font-medium text-foreground">
                  {wtbMatch.maxPrice.toLocaleString("nb-NO")} kr
                </span>
              </span>
            )}
          </div>
        </div>
      )}
    </section>
  );
}

/**
 * Registry-facing wrapper: Price + "Lignende annonser". Attaches
 * SimilarListings directly below Price (mirroring where it already sits on
 * native today) so it has a single home in the field-group registry instead
 * of being interleaved ad hoc per platform in ny-annonse.tsx.
 */
export function PriceGroup(props: WizardSharedProps) {
  return (
    <>
      <Price {...props} />
      <SimilarListings similarListings={props.similarListings} />
    </>
  );
}
