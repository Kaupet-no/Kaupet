import { useMemo, useState } from "react";
import { X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  PART_FITMENT_SCOPE_KEY,
  PART_FITMENT_VEHICLE_IDS_KEY,
  PART_FITMENT_YEAR_FROM_KEY,
  PART_FITMENT_YEAR_TO_KEY,
  type AttributeFilterValue,
  type AttributeValue,
  VEHICLE_BRAND_GROUP_LABELS_NB,
  type VehicleBrandGroup,
} from "@/lib/category-filters";
import {
  useAllVehicleBrands,
  useAllVehicleModelClasses,
  useAllVehicleModels,
} from "@/lib/vehicle/vehicle-brands";
import {
  VehicleBrandField,
  VehicleModelMultiComboboxContent,
  VehicleModelMultiField,
  type VehicleOptionGroupSet,
} from "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields";

const FITMENT_SCOPE_OPTIONS = [
  { value: "universal", label: "Universal del" },
  { value: "specific", label: "Én eller flere bestemte biler" },
  { value: "unknown", label: "Vet ikke" },
] as const;

type AttributeValues = Record<string, AttributeValue>;

type VehiclePickerProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
};

export function PartFitmentField({
  value,
  onChange,
  required = false,
  scopeError,
  vehicleError,
}: {
  value: AttributeValues;
  onChange: (next: AttributeValues) => void;
  required?: boolean;
  scopeError?: string;
  vehicleError?: string;
}) {
  const scope =
    typeof value[PART_FITMENT_SCOPE_KEY] === "string" ? value[PART_FITMENT_SCOPE_KEY] : "";
  const selectedIds = Array.isArray(value[PART_FITMENT_VEHICLE_IDS_KEY])
    ? value[PART_FITMENT_VEHICLE_IDS_KEY]
    : [];
  const yearFrom =
    typeof value[PART_FITMENT_YEAR_FROM_KEY] === "number"
      ? value[PART_FITMENT_YEAR_FROM_KEY]
      : null;
  const yearTo =
    typeof value[PART_FITMENT_YEAR_TO_KEY] === "number" ? value[PART_FITMENT_YEAR_TO_KEY] : null;
  const yearError =
    yearFrom != null && yearTo != null && yearFrom > yearTo
      ? "Årsmodell fra kan ikke være høyere enn årsmodell til."
      : undefined;

  const set = (key: string, next: AttributeValue | undefined) => {
    const values = { ...value };
    if (next === undefined || next === "" || (Array.isArray(next) && next.length === 0)) {
      delete values[key];
    } else {
      values[key] = next;
    }
    onChange(values);
  };

  const setScope = (next: string) => {
    const values: AttributeValues = { ...value, [PART_FITMENT_SCOPE_KEY]: next };
    if (next !== "specific") {
      delete values[PART_FITMENT_VEHICLE_IDS_KEY];
      delete values[PART_FITMENT_YEAR_FROM_KEY];
      delete values[PART_FITMENT_YEAR_TO_KEY];
    }
    onChange(values);
  };

  return (
    <section className="space-y-4 rounded-xl border border-border p-4">
      <div className="space-y-2">
        <Label htmlFor="part-fitment-scope">
          Passer til {required && <span className="text-destructive">*</span>}
        </Label>
        <Select value={scope} onValueChange={setScope}>
          <SelectTrigger
            id="part-fitment-scope"
            aria-required={required || undefined}
            aria-invalid={!!scopeError}
            aria-describedby={scopeError ? "part-fitment-scope-error" : undefined}
          >
            <SelectValue placeholder="Velg kompatibilitet…" />
          </SelectTrigger>
          <SelectContent>
            {FITMENT_SCOPE_OPTIONS.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {scopeError && (
          <p id="part-fitment-scope-error" className="text-sm text-destructive">
            {scopeError}
          </p>
        )}
      </div>

      {scope === "specific" && (
        <>
          <PartVehiclePicker
            selectedIds={selectedIds}
            onChange={(ids) => set(PART_FITMENT_VEHICLE_IDS_KEY, ids)}
          />
          {vehicleError && <p className="text-sm text-destructive">{vehicleError}</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="part-fitment-year-from">Årsmodell fra (valgfritt)</Label>
              <Input
                id="part-fitment-year-from"
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                aria-invalid={!!yearError}
                value={
                  typeof value[PART_FITMENT_YEAR_FROM_KEY] === "number"
                    ? value[PART_FITMENT_YEAR_FROM_KEY]
                    : ""
                }
                onChange={(event) => {
                  const next = event.target.value;
                  set(PART_FITMENT_YEAR_FROM_KEY, next ? Number(next) : undefined);
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="part-fitment-year-to">Årsmodell til (valgfritt)</Label>
              <Input
                id="part-fitment-year-to"
                type="number"
                inputMode="numeric"
                min={1900}
                max={2100}
                aria-invalid={!!yearError}
                value={
                  typeof value[PART_FITMENT_YEAR_TO_KEY] === "number"
                    ? value[PART_FITMENT_YEAR_TO_KEY]
                    : ""
                }
                onChange={(event) => {
                  const next = event.target.value;
                  set(PART_FITMENT_YEAR_TO_KEY, next ? Number(next) : undefined);
                }}
              />
            </div>
          </div>
          {yearError && <p className="text-sm text-destructive">{yearError}</p>}
          <p className="text-xs text-muted-foreground">
            Kompatibiliteten er oppgitt av deg. Kontroller delenummer og variant før salg.
          </p>
        </>
      )}
    </section>
  );
}

export function PartVehicleSearchField({
  value,
  onChange,
  contentOnly = false,
}: {
  value: AttributeFilterValue | undefined;
  onChange: (value: AttributeFilterValue | undefined) => void;
  contentOnly?: boolean;
}) {
  const selectedIds = value?.kind === "multiselect" ? value.values : [];
  const picker = (
    <PartVehiclePicker
      selectedIds={selectedIds}
      onChange={(ids) =>
        onChange(ids.length > 0 ? { kind: "multiselect", values: ids } : undefined)
      }
      contentOnly={contentOnly}
    />
  );
  if (contentOnly) return picker;
  return (
    <>
      {picker}
      <p className="text-xs text-muted-foreground">
        Vis deler som selgeren oppgir passer til valgt modell.
      </p>
    </>
  );
}

function PartVehiclePicker({
  selectedIds,
  onChange,
  contentOnly = false,
}: VehiclePickerProps & { contentOnly?: boolean }) {
  const { data: brands } = useAllVehicleBrands();
  const { data: classes } = useAllVehicleModelClasses();
  const { data: models } = useAllVehicleModels();
  const [categoryGroup, setCategoryGroup] = useState<VehicleBrandGroup>("bil");
  const [brandName, setBrandName] = useState<string>();

  const brandsForGroup = useMemo(
    () => (brands ?? []).filter((brand) => brand.category_group === categoryGroup),
    [brands, categoryGroup],
  );
  const brandId = useMemo(
    () => brandsForGroup.find((brand) => brand.name === brandName)?.id,
    [brandsForGroup, brandName],
  );
  const modelsForBrand = useMemo(
    () => (models ?? []).filter((model) => model.brand_id === brandId),
    [models, brandId],
  );
  const modelOptions = useMemo(
    () => modelsForBrand.map((model) => ({ value: model.id, label: model.name })),
    [modelsForBrand],
  );
  const modelGroups = useMemo<VehicleOptionGroupSet>(() => {
    const groupedModelIds = new Set(
      modelsForBrand.filter((model) => model.class_id != null).map((model) => model.id),
    );
    return {
      groups: (classes ?? [])
        .filter((vehicleClass) => vehicleClass.brand_id === brandId)
        .map((vehicleClass) => ({
          classId: vehicleClass.id,
          className: vehicleClass.name,
          options: modelsForBrand
            .filter((model) => model.class_id === vehicleClass.id)
            .map((model) => ({ value: model.id, label: model.name })),
        })),
      ungrouped: modelOptions.filter((option) => !groupedModelIds.has(option.value)),
    };
  }, [brandId, classes, modelOptions, modelsForBrand]);
  const modelById = useMemo(
    () => new Map((models ?? []).map((model) => [model.id, model])),
    [models],
  );
  const allModelIds = modelsForBrand.map((model) => model.id);
  const allSelected =
    allModelIds.length > 0 &&
    allModelIds.every((id) => selectedIds.includes(id)) &&
    selectedIds.every((id) => allModelIds.includes(id));
  const selectedLabel = allSelected && brandName ? `${brandName} (alle)` : undefined;
  const selectAllLabel = brandName && allModelIds.length > 0 ? `${brandName} (alle)` : undefined;
  const groupOptions = Object.entries(VEHICLE_BRAND_GROUP_LABELS_NB) as [
    VehicleBrandGroup,
    string,
  ][];

  const handleGroupChange = (next: VehicleBrandGroup) => {
    setCategoryGroup(next);
    setBrandName(undefined);
    if (selectedIds.length > 0) onChange([]);
  };
  const handleBrandChange = (next: string | undefined) => {
    setBrandName(next);
    if (selectedIds.length > 0) onChange([]);
  };
  const toggleAllModels = () => {
    onChange(allSelected ? [] : allModelIds);
  };

  const modelField = contentOnly ? (
    <div className="rounded-md border border-border">
      <VehicleModelMultiComboboxContent
        categoryGroup={categoryGroup}
        brandNames={brandName ? [brandName] : []}
        options={modelOptions}
        groups={modelGroups}
        values={selectedIds}
        onChange={onChange}
        selectAllLabel={selectAllLabel}
        allSelected={allSelected}
        onToggleAll={toggleAllModels}
      />
    </div>
  ) : (
    <VehicleModelMultiField
      categoryGroup={categoryGroup}
      brandNames={brandName ? [brandName] : []}
      label="Bilmodell"
      options={modelOptions}
      groups={modelGroups}
      values={selectedIds}
      selectedLabel={selectedLabel}
      selectAllLabel={selectAllLabel}
      allSelected={allSelected}
      onToggleAll={toggleAllModels}
      onChange={onChange}
    />
  );

  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="part-vehicle-group">Kjøretøytype</Label>
        <Select
          value={categoryGroup}
          onValueChange={(value) => handleGroupChange(value as VehicleBrandGroup)}
        >
          <SelectTrigger id="part-vehicle-group">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {groupOptions.map(([value, label]) => (
              <SelectItem key={value} value={value}>
                {label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <VehicleBrandField
        categoryGroup={categoryGroup}
        value={brandName}
        onChange={handleBrandChange}
      />
      {modelField}
      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Valgte kjøretøymodeller">
          {selectedIds.map((id) => {
            const model = modelById.get(id);
            const brand = brands?.find((entry) => entry.id === model?.brand_id)?.name;
            return (
              <span
                key={id}
                className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-sm"
              >
                <span className="truncate">
                  {brand ?? "Kjøretøy"} {model?.name ?? "Ukjent modell"}
                </span>
                <button
                  type="button"
                  className="rounded-full p-0.5 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={`Fjern ${model?.name ?? "valgt modell"}`}
                  onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
                >
                  <X className="size-3.5" />
                </button>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
}
