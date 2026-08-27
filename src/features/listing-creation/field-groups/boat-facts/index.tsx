import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { AttributeFields, useAllCategoryFilters } from "@/components/attribute-fields";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import { getAttributeValueSuggestions } from "@/lib/attribute-suggestions.functions";
import {
  effectiveFiltersForCategory,
  getMissingRequiredFilters,
  type CategoryNode,
} from "@/lib/category-filters";

import { DescriptionField, KeywordChips } from "../description-keywords";
import type { WizardSharedProps } from "../types";
import { RequiredMark } from "../required-mark";

/**
 * Free-text attribute input with autocomplete: suggests values other active
 * listings in the category subtree already use (via the
 * attribute_value_suggestions RPC), but never restricts the user to them —
 * boat brands/models are open-ended, unlike the vehicle_brands-backed
 * pickers cars use.
 */
function SuggestingAttributeInput({
  categoryId,
  attrKey,
  label,
  attributes,
  onAttributesChange,
  extraFieldError,
}: Pick<WizardSharedProps, "attributes" | "onAttributesChange" | "extraFieldError"> & {
  categoryId: string | null;
  attrKey: string;
  label: string;
}) {
  const fieldError = extraFieldError?.field === attrKey ? extraFieldError.message : null;
  const raw = attributes[attrKey];
  const value = typeof raw === "string" ? raw : "";
  const [open, setOpen] = useState(false);
  const [debounced, setDebounced] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fetchSuggestions = useServerFn(getAttributeValueSuggestions);

  const { data: suggestions = [] } = useQuery({
    queryKey: ["attribute-suggestions", categoryId, attrKey, debounced],
    enabled: !!categoryId && open,
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      fetchSuggestions({ data: { categoryId: categoryId!, key: attrKey, q: debounced } }),
  });

  const visibleSuggestions = useMemo(
    () => suggestions.filter((s) => s.toLowerCase() !== value.toLowerCase()),
    [suggestions, value],
  );

  const set = (v: string) => {
    const next = { ...attributes };
    if (v) next[attrKey] = v;
    else delete next[attrKey];
    onAttributesChange(next);
  };

  const fieldId = `boat-${attrKey}`;
  const showSuggestions = open && visibleSuggestions.length > 0;
  return (
    <div className="space-y-2">
      <Label htmlFor={fieldId}>
        {label}
        <RequiredMark />
      </Label>
      <Popover open={showSuggestions}>
        <PopoverAnchor asChild>
          <Input
            id={fieldId}
            value={value}
            autoComplete="off"
            aria-required="true"
            aria-invalid={!!fieldError}
            aria-describedby={fieldError ? `${fieldId}-error` : undefined}
            onFocus={() => setOpen(true)}
            onBlur={() => setOpen(false)}
            onChange={(e) => {
              set(e.target.value);
              if (debounceRef.current) clearTimeout(debounceRef.current);
              const q = e.target.value;
              debounceRef.current = setTimeout(() => setDebounced(q), 250);
            }}
          />
        </PopoverAnchor>
        <PopoverContent
          className="w-[--radix-popover-trigger-width] p-0"
          onOpenAutoFocus={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => e.preventDefault()}
        >
          <ul className="overflow-hidden rounded-md">
            {visibleSuggestions.map((s) => (
              <li key={s}>
                <button
                  type="button"
                  className="w-full px-3 py-2 text-left text-sm hover:bg-accent"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    set(s);
                    setOpen(false);
                  }}
                >
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </PopoverContent>
      </Popover>
      {fieldError && (
        <p id={`${fieldId}-error`} className="text-sm text-destructive">
          {fieldError}
        </p>
      )}
    </div>
  );
}

function SubtitleField({
  register,
  errors,
  subtitle,
}: Pick<WizardSharedProps, "register" | "errors" | "subtitle">) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label htmlFor="subtitle">
          Undertittel <span className="font-normal text-muted-foreground">(valgfritt)</span>
        </Label>
        <span className="text-xs text-muted-foreground">{(subtitle ?? "").length} / 80</span>
      </div>
      <Input
        id="subtitle"
        placeholder="Utstyrskode eller annen relevant informasjon"
        aria-invalid={!!errors.subtitle}
        aria-describedby={errors.subtitle ? "boat-subtitle-error" : undefined}
        {...register("subtitle")}
      />
      {errors.subtitle && (
        <p id="boat-subtitle-error" className="text-sm text-destructive">
          {errors.subtitle.message}
        </p>
      )}
    </div>
  );
}

const BASIC_KEYS = ["boat_type", "length_ft", "year", "construction"];
const MOTOR_KEYS = [
  "motor_type",
  "engine_hours",
  "power_hk",
  "fuel_type",
  "max_speed_knots",
  "sleeping_places",
  "seats",
];

type BoatSectionKey = "basic" | "motor" | "more" | "description";

function BoatDetailsSection({
  section,
  title,
  open,
  hasError,
  onToggle,
  children,
}: {
  section: BoatSectionKey;
  title: string;
  open: boolean;
  hasError: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <details
      open={open}
      data-testid={`boat-facts-${section}`}
      className="rounded-xl border border-border p-4"
    >
      <summary
        className="cursor-pointer list-none text-sm font-medium [&::-webkit-details-marker]:hidden"
        onClick={(event) => {
          event.preventDefault();
          onToggle();
        }}
      >
        <span className="flex items-center justify-between gap-2">
          <span>{title}</span>
          {hasError && (
            <span className="text-xs font-normal text-destructive" role="alert">
              Mangler påkrevde felt
            </span>
          )}
        </span>
      </summary>
      <div className="mt-4 space-y-4">{children}</div>
    </details>
  );
}

function sectionForField(field: string): BoatSectionKey {
  if (field === "description" || field === "subtitle") return "description";
  if (field === "brand" || field === "model" || BASIC_KEYS.includes(field)) return "basic";
  if (MOTOR_KEYS.includes(field)) return "motor";
  return "more";
}

/**
 * Boat flow's facts and description. Category filters remain the source of
 * truth for labels, requiredness and dependencies; this component only groups
 * those existing fields into progressive sections for mobile.
 */
export function BoatFactsGroup(props: WizardSharedProps) {
  const { data: allFilters } = useAllCategoryFilters();
  const categoriesById = useMemo(() => {
    const map = new Map<string, CategoryNode>();
    for (const category of props.categories) map.set(category.id, category);
    return map;
  }, [props.categories]);
  const effectiveFilters = useMemo(
    () => effectiveFiltersForCategory(props.categoryId, allFilters ?? [], categoriesById),
    [props.categoryId, allFilters, categoriesById],
  );
  const allKeys = useMemo(() => effectiveFilters.map((filter) => filter.key), [effectiveFilters]);
  const moreKeys = useMemo(
    () =>
      allKeys.filter(
        (key) =>
          key !== "brand" &&
          key !== "model" &&
          !BASIC_KEYS.includes(key) &&
          !MOTOR_KEYS.includes(key),
      ),
    [allKeys],
  );
  const missingKeys = useMemo(
    () =>
      getMissingRequiredFilters(
        props.categoryId,
        allFilters ?? [],
        categoriesById,
        props.attributes,
      ).map((filter) => filter.key),
    [props.categoryId, allFilters, categoriesById, props.attributes],
  );
  const [openSections, setOpenSections] = useState<Record<BoatSectionKey, boolean>>({
    basic: true,
    motor: false,
    more: false,
    description: false,
  });

  const toggle = (section: BoatSectionKey) =>
    setOpenSections((current) => ({ ...current, [section]: !current[section] }));
  const hasError = (section: BoatSectionKey) =>
    (props.attributesTouched && missingKeys.some((key) => sectionForField(key) === section)) ||
    (!!props.extraFieldError && sectionForField(props.extraFieldError.field) === section) ||
    (section === "description" && (!!props.errors.subtitle || !!props.errors.description));
  const attributeProps = {
    categoryId: props.categoryId,
    categories: props.categories,
    value: props.attributes,
    onChange: props.onAttributesChange,
    required: true,
    showErrors: props.attributesTouched,
    heading: null,
  } as const;

  return (
    <section className="space-y-4" aria-label="Båtfakta">
      <BoatDetailsSection
        section="basic"
        title="Grunnleggende"
        open={openSections.basic || hasError("basic")}
        hasError={hasError("basic")}
        onToggle={() => toggle("basic")}
      >
        <SuggestingAttributeInput
          categoryId={props.categoryId || null}
          attrKey="brand"
          label="Merke"
          attributes={props.attributes}
          onAttributesChange={props.onAttributesChange}
          extraFieldError={props.extraFieldError}
        />
        <SuggestingAttributeInput
          categoryId={props.categoryId || null}
          attrKey="model"
          label="Modell"
          attributes={props.attributes}
          onAttributesChange={props.onAttributesChange}
          extraFieldError={props.extraFieldError}
        />
        <AttributeFields {...attributeProps} filterKeys={BASIC_KEYS} />
      </BoatDetailsSection>

      <BoatDetailsSection
        section="motor"
        title="Motor og kapasitet"
        open={openSections.motor || hasError("motor")}
        hasError={hasError("motor")}
        onToggle={() => toggle("motor")}
      >
        <AttributeFields {...attributeProps} filterKeys={MOTOR_KEYS} />
      </BoatDetailsSection>

      <BoatDetailsSection
        section="more"
        title="Flere opplysninger"
        open={openSections.more || hasError("more")}
        hasError={hasError("more")}
        onToggle={() => toggle("more")}
      >
        <AttributeFields {...attributeProps} filterKeys={moreKeys} />
      </BoatDetailsSection>

      <BoatDetailsSection
        section="description"
        title="Beskrivelse"
        open={openSections.description || hasError("description")}
        hasError={hasError("description")}
        onToggle={() => toggle("description")}
      >
        <DescriptionField {...props} />
        <KeywordChips {...props} />
        <SubtitleField register={props.register} errors={props.errors} subtitle={props.subtitle} />
      </BoatDetailsSection>
    </section>
  );
}
