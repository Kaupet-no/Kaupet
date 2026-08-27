import { useMemo, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
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
} from "@/lib/category-filters";
import { useAllVehicleBrands, useAllVehicleModels } from "@/lib/vehicle/vehicle-brands";

const FITMENT_SCOPE_OPTIONS = [
  { value: "universal", label: "Universal del" },
  { value: "specific", label: "Én eller flere bestemte biler" },
  { value: "unknown", label: "Vet ikke" },
] as const;

type AttributeValues = Record<string, AttributeValue>;

type VehiclePickerProps = {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  single?: boolean;
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
}: {
  value: AttributeFilterValue | undefined;
  onChange: (value: AttributeFilterValue | undefined) => void;
}) {
  const selectedIds = value?.kind === "multiselect" ? value.values : [];
  return (
    <div className="space-y-2">
      <Label>Bilmodell</Label>
      <PartVehiclePicker
        selectedIds={selectedIds}
        single
        onChange={(ids) =>
          onChange(ids.length > 0 ? { kind: "multiselect", values: ids } : undefined)
        }
      />
      <p className="text-xs text-muted-foreground">
        Vis deler som selgeren oppgir passer til valgt modell.
      </p>
    </div>
  );
}

function PartVehiclePicker({ selectedIds, onChange, single = false }: VehiclePickerProps) {
  const { data: brands } = useAllVehicleBrands();
  const { data: models } = useAllVehicleModels();
  const [brandId, setBrandId] = useState("");
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  // PartVehicleSearchField renders this inside an already-open filter-chip
  // Popover (see category-filter-fields.tsx). Two independent Radix Popover
  // portals share the same document.body root and the same hardcoded
  // z-[10001] (ui/popover.tsx), so which one paints on top depends on
  // mount order rather than nesting — exactly the stacking footgun
  // docs/UI-GUIDE.md warns about for Dialog/Sheet/FullscreenOverlay.
  // Portaling into this component's own subtree keeps the model list a
  // strict DOM descendant of whatever container (if any) already wraps it,
  // so it always paints above and never gets clipped by that container.
  const [rootNode, setRootNode] = useState<HTMLDivElement | null>(null);
  const carBrands = useMemo(
    () => (brands ?? []).filter((brand) => brand.category_group === "bil"),
    [brands],
  );
  const modelsForBrand = useMemo(
    () => (models ?? []).filter((model) => model.brand_id === brandId),
    [models, brandId],
  );
  const brandNames = useMemo(
    () => new Map(carBrands.map((brand) => [brand.id, brand.name])),
    [carBrands],
  );
  const modelNames = useMemo(
    () => new Map((models ?? []).map((model) => [model.id, model.name])),
    [models],
  );

  return (
    <div className="space-y-3" ref={setRootNode}>
      <Label>Velg bilmodell</Label>
      <div className="grid gap-3 sm:grid-cols-2">
        <Select
          value={brandId}
          onValueChange={(next) => {
            setBrandId(next);
            setModelOpen(false);
          }}
        >
          <SelectTrigger aria-label="Bilmerke">
            <SelectValue placeholder="Velg merke…" />
          </SelectTrigger>
          <SelectContent>
            {carBrands.map((brand) => (
              <SelectItem key={brand.id} value={brand.id}>
                {brand.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Popover open={modelOpen} onOpenChange={setModelOpen}>
          <PopoverTrigger asChild>
            <Button
              type="button"
              variant="outline"
              role="combobox"
              aria-expanded={modelOpen}
              disabled={!brandId}
              className="w-full justify-between font-normal"
            >
              {brandId ? "Velg modell…" : "Velg merke først"}
              <ChevronDown className="size-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent
            className="w-(--radix-popover-trigger-width) p-0"
            align="start"
            container={rootNode}
          >
            <Command shouldFilter>
              <CommandInput
                placeholder="Søk modell…"
                value={modelSearch}
                onValueChange={setModelSearch}
              />
              <CommandList>
                <CommandEmpty>Ingen modeller funnet.</CommandEmpty>
                <CommandGroup>
                  {modelsForBrand.map((model) => (
                    <CommandItem
                      key={model.id}
                      value={model.name}
                      onSelect={() => {
                        const next = selectedIds.includes(model.id)
                          ? selectedIds.filter((id) => id !== model.id)
                          : single
                            ? [model.id]
                            : [...selectedIds, model.id];
                        onChange(next);
                        setModelSearch("");
                        if (single) setModelOpen(false);
                      }}
                    >
                      <Check
                        className={`size-4 ${selectedIds.includes(model.id) ? "opacity-100" : "opacity-0"}`}
                      />
                      {model.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>

      {selectedIds.length > 0 && (
        <div className="flex flex-wrap gap-2" aria-label="Valgte bilmodeller">
          {selectedIds.map((id) => (
            <span
              key={id}
              className="inline-flex max-w-full items-center gap-1 rounded-full bg-muted px-3 py-1.5 text-sm"
            >
              <span className="truncate">
                {brandNames.get(models?.find((model) => model.id === id)?.brand_id ?? "") ?? "Bil"}{" "}
                {modelNames.get(id) ?? "Ukjent modell"}
              </span>
              <button
                type="button"
                className="rounded-full p-0.5 hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
                aria-label={`Fjern ${modelNames.get(id) ?? "valgt modell"}`}
                onClick={() => onChange(selectedIds.filter((selectedId) => selectedId !== id))}
              >
                <X className="size-3.5" />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
