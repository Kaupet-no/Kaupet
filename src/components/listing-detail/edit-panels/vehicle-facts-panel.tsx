import { useState } from "react";
import { Loader2 } from "lucide-react";

import { useListingEdit } from "@/features/listing-edit/edit-mode-context";
import { DRIVE_TYPE_OPTIONS } from "@/lib/vehicle/vehicle-options";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Inline panel for editing vehicle spec facts (`VehicleInfoGrid`'s
 * seller-overridable subset: kilometerstand, hjuldrift, EU-kontroll
 * fritatt) — the rest of `VehicleInfoGrid` comes straight from the SVV
 * snapshot (`vehicle_lookup`), which is only refreshed via the plate modal. */
export function VehicleFactsPanel({
  mileageKm,
  driveType,
  euControlExempt,
  onClose,
}: {
  mileageKm: number | null;
  driveType: string | null;
  euControlExempt: boolean | null;
  onClose: () => void;
}) {
  const editCtx = useListingEdit();
  const [km, setKm] = useState(mileageKm != null ? String(mileageKm) : "");
  const [drive, setDrive] = useState(driveType ?? "");
  const [exempt, setExempt] = useState(!!euControlExempt);
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    try {
      const attrs: Record<string, unknown> = { eu_control_exempt: exempt };
      if (km.trim() !== "") attrs.mileage_km = Number(km);
      if (drive.trim() !== "") attrs.drive_type = drive.trim();
      await editCtx?.saveField({ group: "attributes", attributes: attrs });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">
        Resterende felter hentes direkte fra Statens vegvesen sitt kjøretøyregister og kan ikke
        endres her.
      </p>
      <div>
        <Label htmlFor="ef-km">Kilometerstand</Label>
        <Input
          id="ef-km"
          type="number"
          min={0}
          value={km}
          onChange={(e) => setKm(e.target.value)}
        />
      </div>
      <div>
        <Label htmlFor="ef-drive">Hjuldrift</Label>
        <Select value={drive} onValueChange={setDrive}>
          <SelectTrigger id="ef-drive">
            <SelectValue placeholder="Velg…" />
          </SelectTrigger>
          <SelectContent>
            {DRIVE_TYPE_OPTIONS.map((o) => (
              <SelectItem key={o.value} value={o.value}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox checked={exempt} onCheckedChange={(c) => setExempt(!!c)} id="ef-eu" />
        <Label htmlFor="ef-eu">Fritatt for EU-kontroll</Label>
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
