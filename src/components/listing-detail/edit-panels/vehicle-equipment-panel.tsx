import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useListingEdit } from "@/features/listing-edit/edit-mode-context";
import { useAllCategoryFilters, type AttributeMap } from "@/components/attribute-fields";
import { VEHICLE_EQUIPMENT_FILTER_KEYS } from "@/lib/category-filters";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

/** Inline panel for the vehicle equipment checklist — reuses the same
 * `category_filters` rows (`utstyr_*` keys) as `VehicleEquipmentList`. */
export function VehicleEquipmentPanel({
  attributes,
  onClose,
}: {
  attributes: Record<string, unknown>;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const { data: allFilters } = useAllCategoryFilters();
  const [values, setValues] = useState<AttributeMap>(() => {
    const init: AttributeMap = {};
    for (const key of VEHICLE_EQUIPMENT_FILTER_KEYS) {
      const v = attributes[key];
      if (Array.isArray(v)) init[key] = v as string[];
    }
    return init;
  });
  const [saving, setSaving] = useState(false);

  const equipmentFilters = (allFilters ?? []).filter((f) =>
    (VEHICLE_EQUIPMENT_FILTER_KEYS as readonly string[]).includes(f.key),
  );

  function toggle(key: string, optionValue: string) {
    setValues((curr) => {
      const list = Array.isArray(curr[key]) ? [...(curr[key] as string[])] : [];
      const idx = list.indexOf(optionValue);
      if (idx >= 0) list.splice(idx, 1);
      else list.push(optionValue);
      return { ...curr, [key]: list };
    });
  }

  async function save() {
    setSaving(true);
    try {
      await editCtx?.saveField({ group: "attributes", attributes: values });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-4 rounded-xl border border-border bg-card p-4">
      {equipmentFilters.map((f) => (
        <div key={f.key}>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {f.label_nb}
          </p>
          <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-sm @sm:grid-cols-2">
            {(f.options ?? []).map((o) => (
              <label key={o.value} className="flex items-center gap-1.5">
                <Checkbox
                  checked={
                    Array.isArray(values[f.key]) && (values[f.key] as string[]).includes(o.value)
                  }
                  onCheckedChange={() => toggle(f.key, o.value)}
                />
                {o.label_nb}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Avbryt
        </Button>
        <Button type="button" size="sm" onClick={save} disabled={saving}>
          {saving && <Loader2 className="size-3.5 animate-spin" />}
          Lagre
        </Button>
      </div>
    </div>
  );
}
