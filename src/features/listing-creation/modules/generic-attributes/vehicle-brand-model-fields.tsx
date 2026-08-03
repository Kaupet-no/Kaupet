import { useEffect, useMemo, useState } from "react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useAllVehicleBrands,
  useAllVehicleModelClasses,
  useAllVehicleModels,
} from "@/lib/vehicle/vehicle-brands";
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

/** The model-class options for a brand (e.g. Mercedes-Benz's C-klasse,
 * E-klasse). `hasClasses` is false for the vast majority of brands, which
 * have no class level at all — callers should skip rendering a class field
 * entirely in that case, not just disable it, to keep today's flat
 * brand→model flow unchanged for those brands. */
export function useVehicleModelClassOptions(
  categoryGroup: VehicleBrandGroup,
  brandName: string | undefined,
  value: string | undefined,
): { options: VehicleOption[]; hasClasses: boolean } {
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allClasses } = useAllVehicleModelClasses();

  const brandId = useMemo(
    () => allBrands?.find((b) => b.category_group === categoryGroup && b.name === brandName)?.id,
    [allBrands, categoryGroup, brandName],
  );

  const classes = useMemo(
    () => (allClasses ?? []).filter((c) => c.brand_id === brandId),
    [allClasses, brandId],
  );

  const options = useMemo(() => {
    const opts = classes.map((c) => ({ value: c.id, label: c.name }));
    if (value && !classes.some((c) => c.id === value)) {
      const name = allClasses?.find((c) => c.id === value)?.name ?? value;
      opts.unshift({ value, label: `${name} (venter godkjenning)` });
    }
    return opts;
  }, [classes, allClasses, value]);

  return { options, hasClasses: classes.length > 0 };
}

/** The model options for a brand (and, when the brand has classes, a chosen
 * class within it). `brandKnown` is false until a brand the reference table
 * recognizes is picked, which is when a model can be chosen. When the brand
 * has classes, `classId` must also be set before any model is offered —
 * mirrors the same "disabled until known" pattern already used for
 * brand→model. Brands without classes ignore `classId` entirely, so nothing
 * changes for them. */
export function useVehicleModelOptions(
  categoryGroup: VehicleBrandGroup,
  brandName: string | undefined,
  value: string | undefined,
  classId?: string | undefined,
): { options: VehicleOption[]; brandKnown: boolean } {
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();
  const { data: allClasses } = useAllVehicleModelClasses();

  const brandId = useMemo(
    () => allBrands?.find((b) => b.category_group === categoryGroup && b.name === brandName)?.id,
    [allBrands, categoryGroup, brandName],
  );

  const brandHasClasses = useMemo(
    () => (allClasses ?? []).some((c) => c.brand_id === brandId),
    [allClasses, brandId],
  );

  const options = useMemo(() => {
    let models = (allModels ?? []).filter((m) => m.brand_id === brandId);
    if (brandHasClasses) {
      models = classId ? models.filter((m) => m.class_id === classId) : [];
    }
    const opts = models.map((m) => ({ value: m.name, label: m.name }));
    // Same reasoning as for brands: a just-imported model isn't approved yet.
    if (value && !models.some((m) => m.name === value)) {
      opts.unshift({ value, label: `${value} (venter godkjenning)` });
    }
    return opts;
  }, [allModels, brandId, brandHasClasses, classId, value]);

  return { options, brandKnown: brandHasClasses ? !!classId : !!brandId };
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
      <Label htmlFor="vehicle-brand">
        Merke {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger id="vehicle-brand" aria-invalid={!!error}>
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

/**
 * Klassevalg (f.eks. Mercedes-Benz' C-klasse/E-klasse) mellom merke og
 * modell. Rendres kun av kallsteder når `useVehicleModelClassOptions`
 * rapporterer `hasClasses` — de aller fleste merker har ingen klasser og
 * skal fortsette rett fra merke til modell som i dag.
 */
export function VehicleModelClassField({
  categoryGroup,
  brandName,
  value,
  onChange,
  required,
  error,
}: {
  categoryGroup: VehicleBrandGroup;
  brandName: string | undefined;
  value: string | undefined;
  onChange: (classId: string | undefined) => void;
  required?: boolean;
  error?: string;
}) {
  const { options } = useVehicleModelClassOptions(categoryGroup, brandName, value);

  return (
    <div className="space-y-2">
      <Label htmlFor="vehicle-model-class">
        Modellklasse {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger id="vehicle-model-class" aria-invalid={!!error}>
          <SelectValue placeholder="Velg klasse…" />
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
  classId,
  value,
  onChange,
  required,
  error,
  freeText = false,
}: {
  categoryGroup: VehicleBrandGroup;
  brandName: string | undefined;
  /** Valgt modellklasse, om merket har klasser (se `VehicleModelClassField`). */
  classId?: string | undefined;
  value: string | undefined;
  onChange: (name: string | undefined) => void;
  required?: boolean;
  error?: string;
  /** Henger-kategorien: Vegvesenet har ofte kun produsent, ikke modell. */
  freeText?: boolean;
}) {
  const { options, brandKnown } = useVehicleModelOptions(categoryGroup, brandName, value, classId);

  if (freeText) {
    return (
      <div className="space-y-2">
        <Label htmlFor="vehicle-model">
          Modell {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="vehicle-model"
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
      <Label htmlFor="vehicle-model">
        Modell {required && <span className="text-destructive">*</span>}
      </Label>
      <Select
        value={value ?? ""}
        onValueChange={(v) => onChange(v || undefined)}
        disabled={!brandKnown}
      >
        <SelectTrigger id="vehicle-model" aria-invalid={!!error}>
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

/**
 * Modell-felt som selv håndterer det valgfrie klasse-mellomtrinnet (f.eks.
 * Mercedes-Benz' C-klasse) — kallsteder trenger ikke selv vite om det valgte
 * merket har klasser. For de aller fleste merker (ingen klasser) er dette
 * identisk med å bruke `VehicleModelField` direkte.
 */
export function VehicleModelWithClassField({
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
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();
  const { hasClasses } = useVehicleModelClassOptions(categoryGroup, brandName, undefined);

  const brandId = useMemo(
    () => allBrands?.find((b) => b.category_group === categoryGroup && b.name === brandName)?.id,
    [allBrands, categoryGroup, brandName],
  );
  // Utleder klassen fra en allerede valgt modell (f.eks. ved redigering av en
  // eksisterende annonse), slik at klassefeltet forhåndsutfylles i stedet for
  // å tvinge brukeren til å velge klasse på nytt for en verdi som alt er satt.
  const derivedClassId = useMemo(
    () => allModels?.find((m) => m.brand_id === brandId && m.name === value)?.class_id ?? undefined,
    [allModels, brandId, value],
  );
  const [classId, setClassId] = useState<string | undefined>(derivedClassId ?? undefined);
  useEffect(() => {
    setClassId(derivedClassId ?? undefined);
  }, [derivedClassId, brandName]);

  if (freeText || !hasClasses) {
    return (
      <VehicleModelField
        categoryGroup={categoryGroup}
        brandName={brandName}
        value={value}
        onChange={onChange}
        required={required}
        error={error}
        freeText={freeText}
      />
    );
  }

  return (
    <>
      <VehicleModelClassField
        categoryGroup={categoryGroup}
        brandName={brandName}
        value={classId}
        onChange={(next) => {
          setClassId(next);
          if (next !== derivedClassId) onChange(undefined);
        }}
        required={required}
      />
      <VehicleModelField
        categoryGroup={categoryGroup}
        brandName={brandName}
        classId={classId}
        value={value}
        onChange={onChange}
        required={required}
        error={error}
      />
    </>
  );
}
