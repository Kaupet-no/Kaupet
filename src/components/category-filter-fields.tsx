import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AttributeFilterValue, CategoryFilter } from "@/lib/category-filters";

/**
 * Renders the configurable filter controls for a category's `CategoryFilter`s
 * (boolean/select/multiselect/text/range), driving them off externally-owned
 * state so the same UI can be embedded both on the category page and in the
 * landing page's category picker.
 */
export function CategoryFilterFields({
  filters,
  values,
  onChange,
}: {
  filters: CategoryFilter[];
  values: Record<string, AttributeFilterValue>;
  onChange: (key: string, value: AttributeFilterValue | undefined) => void;
}) {
  return (
    <>
      {filters.map((f) => {
        const current = values[f.key];

        if (f.type === "boolean") {
          return (
            <label key={f.id} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={current?.kind === "boolean" ? current.value : false}
                onCheckedChange={(c) =>
                  onChange(f.key, c === true ? { kind: "boolean", value: true } : undefined)
                }
              />
              {f.label_nb}
            </label>
          );
        }
        if (f.type === "select" || f.type === "multiselect") {
          // Both rendered as single-select dropdowns here for simplicity.
          return (
            <div key={f.id} className="space-y-2">
              <Label>{f.label_nb}</Label>
              <Select
                value={current?.kind === "select" ? current.value : "__all__"}
                onValueChange={(v) =>
                  onChange(f.key, v === "__all__" ? undefined : { kind: "select", value: v })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all__">Alle</SelectItem>
                  {(f.options ?? []).map((o) => (
                    <SelectItem key={o.value} value={o.value}>
                      {o.label_nb}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          );
        }
        // number / range / text → min/max for numeric, single field for text
        if (f.type === "text") {
          return (
            <div key={f.id} className="space-y-2">
              <Label>{f.label_nb}</Label>
              <Input
                value={current?.kind === "text" ? current.value : ""}
                onChange={(e) =>
                  onChange(
                    f.key,
                    e.target.value ? { kind: "text", value: e.target.value } : undefined,
                  )
                }
              />
            </div>
          );
        }
        const range = current?.kind === "range" ? current : { min: undefined, max: undefined };
        const updateRange = (patch: { min?: number; max?: number }) => {
          const merged = { min: range.min, max: range.max, ...patch };
          if (merged.min === undefined && merged.max === undefined) {
            onChange(f.key, undefined);
            return;
          }
          onChange(f.key, { kind: "range", min: merged.min, max: merged.max });
        };
        return (
          <div key={f.id} className="space-y-2">
            <Label>
              {f.label_nb}
              {f.unit ? ` (${f.unit})` : ""}
            </Label>
            <div className="flex items-center gap-2">
              <Input
                type="number"
                placeholder="Fra"
                value={range.min ?? ""}
                onChange={(e) =>
                  updateRange({ min: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
              <Input
                type="number"
                placeholder="Til"
                value={range.max ?? ""}
                onChange={(e) =>
                  updateRange({ max: e.target.value === "" ? undefined : Number(e.target.value) })
                }
              />
            </div>
          </div>
        );
      })}
    </>
  );
}
