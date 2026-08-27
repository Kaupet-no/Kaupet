import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
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

/** The model options for a brand, grouped by model class (e.g. Mercedes-Benz'
 * C-klasse, E-klasse) when the brand has any — used to render one grouped
 * dropdown instead of a separate class-then-model step. When `hasClasses` is
 * false, `groups` is empty and every model is in `ungrouped`, so callers can
 * render a flat list unchanged — the vast majority of brands have no class
 * level at all. */
export function useVehicleModelOptionsGrouped(
  categoryGroup: VehicleBrandGroup,
  brandName: string | undefined,
  value: string | undefined,
): {
  hasClasses: boolean;
  groups: { classId: string; className: string; options: VehicleOption[] }[];
  ungrouped: VehicleOption[];
  brandKnown: boolean;
} {
  const { data: allBrands } = useAllVehicleBrands();
  const { data: allModels } = useAllVehicleModels();
  const { data: allClasses } = useAllVehicleModelClasses();

  const brandId = useMemo(
    () => allBrands?.find((b) => b.category_group === categoryGroup && b.name === brandName)?.id,
    [allBrands, categoryGroup, brandName],
  );

  const classesForBrand = useMemo(
    () => (allClasses ?? []).filter((c) => c.brand_id === brandId),
    [allClasses, brandId],
  );

  return useMemo(() => {
    const models = (allModels ?? []).filter((m) => m.brand_id === brandId);
    const toOption = (m: { name: string }): VehicleOption => ({ value: m.name, label: m.name });

    const groups = classesForBrand.map((c) => ({
      classId: c.id,
      className: c.name,
      options: models.filter((m) => m.class_id === c.id).map(toOption),
    }));
    const ungrouped = models.filter((m) => !m.class_id).map(toOption);

    // Same "not yet approved" handling as the flat hooks above: a value
    // missing from the reference table (e.g. a just-imported model) must
    // still show up, prepended to whichever bucket it would otherwise be in.
    const known = models.some((m) => m.name === value);
    if (value && !known) {
      ungrouped.unshift({ value, label: `${value} (venter godkjenning)` });
    }

    return { hasClasses: classesForBrand.length > 0, groups, ungrouped, brandKnown: !!brandId };
  }, [allModels, brandId, classesForBrand, value]);
}

/**
 * Model options across every brand in `brandNames` at once — used by the
 * search-side Merke/Modell multiselect chips (attribute-filter-chips.tsx),
 * where several brands can be checked simultaneously and the model list
 * should cover all of them, unlike the listing-creation form's single-brand
 * `useVehicleModelOptionsGrouped` above (a listing only ever has one brand).
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
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const currentLabel = options.find((o) => o.value === value)?.label;

  return (
    <div className="space-y-2">
      <Label htmlFor="vehicle-brand">
        Merke {required && <span className="text-destructive">*</span>}
      </Label>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id="vehicle-brand"
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-required={required || undefined}
            aria-invalid={!!error}
            className="native-touch-target w-full justify-between font-normal hover:text-foreground"
          >
            <span className={cn("truncate", !currentLabel && "text-muted-foreground")}>
              {currentLabel ?? "Velg merke…"}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder="Søk merke…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>Ingen treff.</CommandEmpty>
              <CommandGroup>
                {options.map((o) => (
                  <CommandItem
                    key={o.value}
                    value={o.label}
                    onSelect={() => {
                      onChange(o.value);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")}
                    />
                    {o.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
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
  const { groups, ungrouped, brandKnown } = useVehicleModelOptionsGrouped(
    categoryGroup,
    brandName,
    value,
  );
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const currentLabel = [...groups.flatMap((g) => g.options), ...ungrouped].find(
    (o) => o.value === value,
  )?.label;

  if (freeText) {
    return (
      <div className="space-y-2">
        <Label htmlFor="vehicle-model">
          Modell {required && <span className="text-destructive">*</span>}
        </Label>
        <Input
          id="vehicle-model"
          aria-required={required || undefined}
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
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setSearch("");
        }}
      >
        <PopoverTrigger asChild>
          <Button
            id="vehicle-model"
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            aria-required={required || undefined}
            aria-invalid={!!error}
            disabled={!brandKnown}
            className="native-touch-target w-full justify-between font-normal hover:text-foreground"
          >
            <span className={cn("truncate", !currentLabel && "text-muted-foreground")}>
              {currentLabel ?? (brandKnown ? "Velg modell…" : "Velg merke først")}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <Command shouldFilter>
            <CommandInput placeholder="Søk modell…" value={search} onValueChange={setSearch} />
            <CommandList>
              <CommandEmpty>Ingen treff.</CommandEmpty>
              {groups.map((g) => (
                <CommandGroup key={g.classId} heading={g.className}>
                  {g.options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.label}
                      className="pl-6"
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")}
                      />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}
              {ungrouped.length > 0 && (
                <CommandGroup>
                  {ungrouped.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.label}
                      onSelect={() => {
                        onChange(o.value);
                        setOpen(false);
                        setSearch("");
                      }}
                    >
                      <Check
                        className={cn("size-4", value === o.value ? "opacity-100" : "opacity-0")}
                      />
                      {o.label}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}

/**
 * Modell-felt som selv håndterer det valgfrie klasse-mellomtrinnet (f.eks.
 * Mercedes-Benz' C-klasse) — kallsteder trenger ikke selv vite om det valgte
 * merket har klasser. For de aller fleste merker (ingen klasser) er dette
 * identisk med å bruke `VehicleModelField` direkte; for merker med klasser
 * vises klassene som grupperte overskrifter med innrykkede modeller i én og
 * samme nedtrekksmeny i stedet for et eget klasse-steg foran modell-steget.
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

/**
 * Modell-multiselect med søk og gruppering per klasse (samme "{klasse} (Alle)"
 * -rad som velger/fjerner alle modellene i klassen på én gang) — brukes av
 * søkesider der flere modeller kan krysses av samtidig, i motsetning til
 * annonse-skjemaets `VehicleModelField` (én annonse har kun én modell). Kun
 * innholdet (Command/søkefelt/liste), ingen egen trigger-knapp — kallsteder
 * som skal ha en ferdig felt-med-trigger bruker `VehicleModelMultiField`
 * under, kallsteder med egen chip/trigger (f.eks. attribute-filter-chips.tsx)
 * bruker denne direkte inni sin egen `PopoverContent`.
 */
export function VehicleModelMultiComboboxContent({
  categoryGroup,
  brandNames,
  values,
  onChange,
  emptyMessage,
  counts,
}: {
  categoryGroup: VehicleBrandGroup;
  brandNames: string[];
  values: string[];
  onChange: (values: string[]) => void;
  emptyMessage?: string;
  /** Result counts keyed by model value, e.g. `{ "3-serie": 61 }`. */
  counts?: Record<string, number>;
}) {
  const countLabel = (value: string, label: string) =>
    counts?.[value] != null ? `${label} (${counts[value]})` : label;
  const singleBrand = brandNames.length === 1 ? brandNames[0] : undefined;
  const grouped = useVehicleModelOptionsGrouped(categoryGroup, singleBrand, undefined);
  const flatOptions = useVehicleModelOptionsForBrands(categoryGroup, brandNames, values);
  const brandKnown = brandNames.length > 0;
  const [search, setSearch] = useState("");

  const toggle = (v: string) => {
    onChange(values.includes(v) ? values.filter((x) => x !== v) : [...values, v]);
  };
  const toggleAll = (modelNames: string[], checked: boolean) => {
    if (checked) onChange([...values, ...modelNames.filter((n) => !values.includes(n))]);
    else onChange(values.filter((v) => !modelNames.includes(v)));
  };

  const useGrouped = singleBrand != null && grouped.hasClasses;

  return (
    <Command shouldFilter>
      <CommandInput placeholder="Søk modell…" value={search} onValueChange={setSearch} />
      <CommandList>
        <CommandEmpty>
          {emptyMessage ??
            (brandKnown ? "Ingen modeller funnet." : "Velg minst ett merke for å se modeller.")}
        </CommandEmpty>
        {useGrouped ? (
          <>
            {grouped.groups.map((g) => {
              const modelNames = g.options.map((o) => o.value);
              const allChecked =
                modelNames.length > 0 && modelNames.every((n) => values.includes(n));
              return (
                <CommandGroup key={g.classId} heading={g.className}>
                  <CommandItem
                    value={`${g.className} (Alle)`}
                    className="font-medium"
                    onSelect={() => toggleAll(modelNames, !allChecked)}
                  >
                    <Check className={cn("size-4", allChecked ? "opacity-100" : "opacity-0")} />
                    {g.className} (Alle)
                  </CommandItem>
                  {g.options.map((o) => (
                    <CommandItem
                      key={o.value}
                      value={o.label}
                      className="pl-6"
                      onSelect={() => toggle(o.value)}
                    >
                      <Check
                        className={cn(
                          "size-4",
                          values.includes(o.value) ? "opacity-100" : "opacity-0",
                        )}
                      />
                      {countLabel(o.value, o.label)}
                    </CommandItem>
                  ))}
                </CommandGroup>
              );
            })}
            {grouped.ungrouped.length > 0 && (
              <CommandGroup>
                {grouped.ungrouped.map((o) => (
                  <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                    <Check
                      className={cn(
                        "size-4",
                        values.includes(o.value) ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {countLabel(o.value, o.label)}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </>
        ) : (
          <CommandGroup>
            {flatOptions.map((o) => (
              <CommandItem key={o.value} value={o.label} onSelect={() => toggle(o.value)}>
                <Check
                  className={cn("size-4", values.includes(o.value) ? "opacity-100" : "opacity-0")}
                />
                {countLabel(o.value, o.label)}
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </Command>
  );
}

/** Full felt (label + trigger-knapp + popover) rundt
 * `VehicleModelMultiComboboxContent` — for kallsteder uten egen trigger/chip
 * fra før, som søkefilter-panelet på forsiden (`category-filter-fields.tsx`).
 */
export function VehicleModelMultiField({
  categoryGroup,
  brandNames,
  values,
  onChange,
  label = "Modell",
  counts,
}: {
  categoryGroup: VehicleBrandGroup;
  brandNames: string[];
  values: string[];
  onChange: (values: string[]) => void;
  label?: string;
  counts?: Record<string, number>;
}) {
  const [open, setOpen] = useState(false);
  const brandKnown = brandNames.length > 0;
  const triggerLabel =
    values.length === 0 ? undefined : values.length === 1 ? values[0] : `${values.length} valgt`;

  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            disabled={!brandKnown}
            className="native-touch-target w-full justify-between font-normal hover:text-foreground"
          >
            <span className={cn("truncate", !triggerLabel && "text-muted-foreground")}>
              {triggerLabel ?? (brandKnown ? `Velg ${label.toLowerCase()}…` : "Velg merke først")}
            </span>
            <ChevronDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-(--radix-popover-trigger-width) p-0" align="start">
          <VehicleModelMultiComboboxContent
            categoryGroup={categoryGroup}
            brandNames={brandNames}
            values={values}
            onChange={onChange}
            counts={counts}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}
