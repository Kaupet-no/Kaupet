import { useMemo } from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";
import type { VehicleBrandGroup } from "@/lib/category-filters";

/** One option in a brand/model dropdown. `label` differs from `value` only for
 * a not-yet-approved value, which is suffixed "(venter godkjenning)". */
export type VehicleOption = { value: string; label: string };

/**
 * The brand options for a category group. A brand added via the Statens
 * vegvesen import isn't approved yet and so is missing from the reference
 * table — without re-adding it the selected value would vanish from the
 * control instead of showing what the user just confirmed.
 */
export function useVehicleBrandOptions(
  categoryGroup: VehicleBrandGroup,
  value: string | undefined,
): VehicleOption[] {
  const { data: allBrands } = useAllVehicleBrands();
  return useMemo(() => {
    const brands = (allBrands ?? []).filter((b) => b.category_group === categoryGroup);
    const options = brands.map((b) => ({ value: b.name, label: b.name }));
    if (value && !brands.some((b) => b.name === value)) {
      options.unshift({ value, label: `${value} (venter godkjenning)` });
    }
    return options;
  }, [allBrands, categoryGroup, value]);
}

/** The model options for a brand. `brandKnown` is false until a brand the
 * reference table recognizes is picked, which is when a model can be chosen. */
export function useVehicleModelOptions(
  categoryGroup: VehicleBrandGroup,
  brandName: string | undefined,
  value: string | undefined,
): { options: VehicleOption[]; brandKnown: boolean } {
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();

  const brandId = useMemo(
    () => allBrands?.find((b) => b.category_group === categoryGroup && b.name === brandName)?.id,
    [allBrands, categoryGroup, brandName],
  );

  const options = useMemo(() => {
    const models = (allModels ?? []).filter((m) => m.brand_id === brandId);
    const opts = models.map((m) => ({ value: m.name, label: m.name }));
    // Same reasoning as for brands: a just-imported model isn't approved yet.
    if (value && !models.some((m) => m.name === value)) {
      opts.unshift({ value, label: `${value} (venter godkjenning)` });
    }
    return opts;
  }, [allModels, brandId, value]);

  return { options, brandKnown: !!brandId };
}

/**
 * Model options across every brand in `brandNames` at once — used by the
 * search-side Merke/Modell multiselect chips (attribute-filter-chips.tsx),
 * where several brands can be checked simultaneously and the model list
 * should cover all of them, unlike the listing-creation form's single-brand
 * `useVehicleModelOptions` above (a listing only ever has one brand).
 */
export function useVehicleModelOptionsForBrands(
  categoryGroup: VehicleBrandGroup,
  brandNames: string[],
  /** Currently-checked model values — included even if missing from the
   * reference table (e.g. a just-imported, not-yet-approved model, same
   * reasoning as useVehicleModelOptions above), so a model landed on via a
   * breadcrumb click still shows up checked instead of silently vanishing
   * from the list it should be pre-selected in. */
  selectedValues: string[] = [],
): VehicleOption[] {
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();

  return useMemo(() => {
    const brandIdToName = new Map(
      (allBrands ?? [])
        .filter((b) => b.category_group === categoryGroup && brandNames.includes(b.name))
        .map((b) => [b.id, b.name]),
    );
    if (brandIdToName.size === 0) return [];
    const models = (allModels ?? []).filter((m) => brandIdToName.has(m.brand_id));
    // Grouped by brand when more than one is selected, so the checkbox list
    // doesn't read as one undifferentiated pile of models.
    const multiBrand = brandIdToName.size > 1;
    const options = models.map((m) => {
      const brandName = brandIdToName.get(m.brand_id)!;
      return { value: m.name, label: multiBrand ? `${m.name} (${brandName})` : m.name };
    });
    const known = new Set(options.map((o) => o.value));
    for (const v of selectedValues) {
      if (!known.has(v)) options.unshift({ value: v, label: `${v} (venter godkjenning)` });
    }
    return options;
  }, [allBrands, allModels, categoryGroup, brandNames, selectedValues]);
}

/**
 * Koblede merke/modell-nedtrekksmenyer: et merke har mange modeller, en
 * modell har ett merke. Ingen fritekst — bruker kan kun velge fra
 * predefinerte verdier (nye verdier legges kun til via Statens
 * vegvesen-import-bekreftelsen, ikke fritt her).
 */
export function VehicleBrandField({
  categoryGroup,
  value,
  onChange,
  required,
  error,
}: {
  categoryGroup: VehicleBrandGroup;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  required?: boolean;
  error?: string;
}) {
  const options = useVehicleBrandOptions(categoryGroup, value);

  return (
    <div className="space-y-2">
      <Label>Merke {required && <span className="text-destructive">*</span>}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger aria-invalid={!!error}>
          <SelectValue placeholder="Velg merke…" />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

export function VehicleModelField({
  categoryGroup,
  brandName,
  value,
  onChange,
  required,
  error,
  freeText = false,
}: {
  categoryGroup: VehicleBrandGroup;
  brandName: string | undefined;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  required?: boolean;
  error?: string;
  /** Henger-kategorien: Vegvesenet har ofte kun produsent, ikke modell. */
  freeText?: boolean;
}) {
  const { options, brandKnown } = useVehicleModelOptions(categoryGroup, brandName, value);

  if (freeText) {
    return (
      <div className="space-y-2">
        <Label>Modell {required && <span className="text-destructive">*</span>}</Label>
        <Input
          aria-invalid={!!error}
          value={value ?? ""}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Label>Modell {required && <span className="text-destructive">*</span>}</Label>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onChange(v || undefined)}
        disabled={!brandKnown}
      >
        <SelectTrigger aria-invalid={!!error}>
          <SelectValue placeholder={brandKnown ? "Velg modell…" : "Velg merke først"} />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
