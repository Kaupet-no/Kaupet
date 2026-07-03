import { Search } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";

import type { WizardSharedProps } from "../types";
import { FieldValid } from "../field-valid";
import { SimilarListings } from "../similar-listings";

/**
 * Pris (price) + "gis bort gratis" + WTB-treff-hint. The WTB hint used to be
 * web-only; per the approved native-gap fix it now renders on both platforms
 * since it only depends on category_id + price_nok, not on anything
 * platform-specific.
 */
export function Price({
  register,
  errors,
  touchedFields,
  isFree,
  setValue,
  priceNok,
  wtbMatch,
}: WizardSharedProps) {
  return (
    <section className="space-y-3">
      <div className="flex items-center gap-1.5">
        <Label>Pris</Label>
        <FieldValid
          show={
            (!!touchedFields.price_nok || isFree) &&
            !errors.price_nok &&
            (isFree || typeof priceNok === "number")
          }
        />
      </div>
      <div className="flex items-center gap-3">
        <Input
          type="number"
          min={0}
          placeholder="kr"
          disabled={isFree}
          className="max-w-[200px]"
          aria-invalid={!!errors.price_nok}
          aria-describedby={errors.price_nok ? "price-error" : undefined}
          {...register("price_nok")}
        />
        <label className="flex items-center gap-2 text-sm">
          <Checkbox checked={isFree} onCheckedChange={(v) => setValue("is_free", Boolean(v))} />
          Gis bort gratis
        </label>
      </div>
      {errors.price_nok && (
        <p id="price-error" className="text-sm text-destructive">
          {errors.price_nok.message as string}
        </p>
      )}
      {!isFree && wtbMatch && wtbMatch.count > 0 && (
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
