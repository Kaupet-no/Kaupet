import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useListingEdit } from "@/features/listing-edit/edit-mode-context";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

/** Inline panel for the grouped "Kjente feil / vedlikeholdshistorikk" save
 * (all three fields commit together, mirroring the old field-group). */
export function VehicleConditionPanel({
  knownIssues,
  noKnownIssues,
  maintenanceHistory,
  onClose,
}: {
  knownIssues: string | null;
  noKnownIssues: boolean;
  maintenanceHistory: string | null;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const [issues, setIssues] = useState(knownIssues ?? "");
  const [none, setNone] = useState(noKnownIssues);
  const [maintenance, setMaintenance] = useState(maintenanceHistory ?? "");
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!none && !issues.trim()) return;
    setSaving(true);
    try {
      await editCtx?.saveField({
        group: "vehicle-condition",
        known_issues: none ? null : issues.trim() || null,
        no_known_issues: none,
        maintenance_history: maintenance.trim() || null,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2">
        <Checkbox checked={none} onCheckedChange={(c) => setNone(!!c)} id="vc-none" />
        <Label htmlFor="vc-none">Ingen kjente feil eller mangler</Label>
      </div>
      {!none && (
        <div>
          <Label htmlFor="vc-issues">Kjente feil og mangler</Label>
          <Textarea
            id="vc-issues"
            rows={4}
            value={issues}
            onChange={(e) => setIssues(e.target.value)}
          />
        </div>
      )}
      <div>
        <Label htmlFor="vc-maint">Vedlikeholdshistorikk</Label>
        <Textarea
          id="vc-maint"
          rows={4}
          value={maintenance}
          onChange={(e) => setMaintenance(e.target.value)}
        />
      </div>
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
