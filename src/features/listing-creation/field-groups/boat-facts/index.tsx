import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getAttributeValueSuggestions } from "@/lib/attribute-suggestions.functions";

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
  return (
    <div className="relative space-y-2">
      <Label htmlFor={fieldId}>
        {label}
        <RequiredMark />
      </Label>
      <Input
        id={fieldId}
        value={value}
        autoComplete="off"
        aria-invalid={!!fieldError}
        aria-describedby={fieldError ? `${fieldId}-error` : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          set(e.target.value);
          if (debounceRef.current) clearTimeout(debounceRef.current);
          const q = e.target.value;
          debounceRef.current = setTimeout(() => setDebounced(q), 250);
        }}
      />
      {fieldError && (
        <p id={`${fieldId}-error`} className="text-sm text-destructive">
          {fieldError}
        </p>
      )}
      {open && visibleSuggestions.length > 0 && (
        <ul className="absolute z-20 mt-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
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
        {...register("subtitle")}
      />
      {errors.subtitle && <p className="text-sm text-destructive">{errors.subtitle.message}</p>}
    </div>
  );
}

/**
 * Boat flow's first step: Merke/Modell as free text with suggestions from
 * existing boat listings (boats have no registry lookup like cars' SVV), plus
 * Undertittel. The remaining boat attributes (Båttype, Størrelse, Motortype,
 * …) render through the generic category-attributes group, driven by the
 * Båter category_filters rows.
 */
export function BoatFactsGroup(props: WizardSharedProps) {
  return (
    <section className="space-y-4">
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
      <SubtitleField register={props.register} errors={props.errors} subtitle={props.subtitle} />
    </section>
  );
}
