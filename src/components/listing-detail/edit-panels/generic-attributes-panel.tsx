import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useListingEdit } from "@/features/listing-edit/edit-mode-context";
import { AttributeFields, type AttributeMap } from "@/components/attribute-fields";
import { useCategories } from "@/hooks/use-categories";
import { Button } from "@/components/ui/button";

/** Inline panel for generic (non-vehicle) category attributes — reuses
 * `AttributeFields` (the same per-filter inputs the create wizard uses). */
export function GenericAttributesPanel({
  categoryId,
  attributes,
  onClose,
}: {
  categoryId: string;
  attributes: Record<string, unknown>;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const [values, setValues] = useState<AttributeMap>(attributes as AttributeMap);
  const [saving, setSaving] = useState(false);
  const { data: categories } = useCategories();

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
    <div className="mt-6 space-y-3">
      <AttributeFields
        categoryId={categoryId}
        categories={categories ?? []}
        value={values}
        onChange={setValues}
      />
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
