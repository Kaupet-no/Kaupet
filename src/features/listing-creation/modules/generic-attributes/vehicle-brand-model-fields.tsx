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
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle-brands";
import type { VehicleBrandGroup } from "@/lib/category-filters";

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
  const { data: allBrands } = useAllVehicleBrands();
  const brands = useMemo(
    () => (allBrands ?? []).filter((b) => b.category_group === categoryGroup),
    [allBrands, categoryGroup],
  );
  // Et nylig lagt til merke er ikke godkjent ennå og finnes derfor ikke i
  // `brands` — uten dette forsvinner valgt verdi sporløst fra den synlige
  // kontrollen (viser tom boks i stedet for merket brukeren nettopp bekreftet).
  const hasPendingValue = !!value && !brands.some((b) => b.name === value);

  return (
    <div className="space-y-2">
      <Label>Merke {required && <span className="text-destructive">*</span>}</Label>
      <Select value={value ?? ""} onValueChange={(v) => onChange(v || undefined)}>
        <SelectTrigger aria-invalid={!!error}>
          <SelectValue placeholder="Velg merke…" />
        </SelectTrigger>
        <SelectContent>
          {hasPendingValue && <SelectItem value={value!}>{value} (venter godkjenning)</SelectItem>}
          {brands.map((b) => (
            <SelectItem key={b.id} value={b.name}>
              {b.name}
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
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();

  const brandId = useMemo(
    () => allBrands?.find((b) => b.category_group === categoryGroup && b.name === brandName)?.id,
    [allBrands, categoryGroup, brandName],
  );
  const models = useMemo(
    () => (allModels ?? []).filter((m) => m.brand_id === brandId),
    [allModels, brandId],
  );
  // Samme resonnement som for merke: en nylig lagt til modell er ikke
  // godkjent ennå og finnes derfor ikke i `models`.
  const hasPendingValue = !!value && !models.some((m) => m.name === value);

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
        disabled={!brandId}
      >
        <SelectTrigger aria-invalid={!!error}>
          <SelectValue placeholder={brandId ? "Velg modell…" : "Velg merke først"} />
        </SelectTrigger>
        <SelectContent>
          {hasPendingValue && <SelectItem value={value!}>{value} (venter godkjenning)</SelectItem>}
          {models.map((m) => (
            <SelectItem key={m.id} value={m.name}>
              {m.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
