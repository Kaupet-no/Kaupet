import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Loader2 } from "lucide-react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogFooter } from "@/components/ui/dialog";
import { formatErrorMessage } from "@/lib/errors";
import {
  DEFAULT_FIELD_GROUPS,
  DEFAULT_MODULES,
  normalizeFieldGroupKeys,
  resolveWizardPages,
  toStoredFieldGroupKeys,
} from "@/features/listing-creation/category-flows";
import {
  FIELD_GROUP_LABELS_NB,
  LOCKED_FIELD_GROUP_KEYS,
} from "@/features/listing-creation/field-groups/registry";
import { MIDDLE_FIELD_GROUP_KEYS, type Category } from "./shared";

function SortableFieldGroupRow({
  id,
  checked,
  disabled,
  onToggle,
}: {
  id: string;
  checked: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };
  return (
    <li ref={setNodeRef} style={style} className="flex items-center gap-2 rounded-md px-1 py-1">
      <button
        type="button"
        {...attributes}
        {...listeners}
        className="cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
        aria-label="Dra for å endre rekkefølge"
      >
        <GripVertical className="size-4" />
      </button>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox checked={checked} disabled={disabled} onCheckedChange={onToggle} />
        {FIELD_GROUP_LABELS_NB[id] ?? id}
      </label>
    </li>
  );
}

function FieldGroupPagesPreview({ label, pages }: { label: string; pages: string[][] }) {
  return (
    <p>
      <span className="font-medium text-foreground">{label}</span> — {pages.length}{" "}
      {pages.length === 1 ? "side" : "sider"}:{" "}
      {pages
        .map((p, i) => `${i + 1}) ${p.map((k) => FIELD_GROUP_LABELS_NB[k] ?? k).join(", ")}`)
        .join("  ")}
    </p>
  );
}

export function CategoryFlowPanel({ category }: { category: Category }) {
  const qc = useQueryClient();

  const {
    data: flowRow,
    isLoading,
    isError,
    error: flowError,
  } = useQuery({
    queryKey: ["admin", "category-flow", category.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("category_flows")
        .select("id, category_id, field_groups, modules, sort_order")
        .eq("category_id", category.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [modules, setModules] = useState<string[] | null>(null);
  const activeModules = modules ?? flowRow?.modules ?? DEFAULT_MODULES;
  const hasCustomFlow = !!flowRow;

  const [fieldGroups, setFieldGroups] = useState<string[] | null>(null);
  const storedFieldGroups =
    fieldGroups ?? normalizeFieldGroupKeys(flowRow?.field_groups ?? DEFAULT_FIELD_GROUPS);
  const middleOrder = [
    ...storedFieldGroups.filter((k) => MIDDLE_FIELD_GROUP_KEYS.includes(k)),
    ...MIDDLE_FIELD_GROUP_KEYS.filter((k) => !storedFieldGroups.includes(k)),
  ];
  // vehicle-registration (Statens vegvesen-oppslag for Bil og MC) isn't part
  // of MIDDLE_FIELD_GROUP_KEYS — this simple editor doesn't support letting
  // admins reorder/toggle it yet — but it must survive a save if the
  // category already has it (seeded via migration), or the vehicle-first
  // flow silently breaks the next time someone touches this dialog.
  const hasVehicleRegistration = storedFieldGroups.includes("vehicle-registration");
  // vehicle-facts/vehicle-condition/vehicle-equipment (Bil og MC's split-out
  // Tittel/Pris/Kilometerstand, Tilstand/kjente feil-mangler/
  // vedlikeholdshistorikk, and Utstyr sections, see UX audit) aren't part of
  // MIDDLE_FIELD_GROUP_KEYS either — same reasoning and same fix as
  // vehicle-registration above: they must survive a save if the category
  // already has them, or the vehicle flow silently loses steps the next time
  // someone touches this dialog. Native vehicle order is facts, description,
  // condition, equipment, as defined by the composer plan.
  const hasVehicleFacts = storedFieldGroups.includes("vehicle-facts");
  const hasVehicleCondition = storedFieldGroups.includes("vehicle-condition");
  const hasVehicleEquipment = storedFieldGroups.includes("vehicle-equipment");
  const activeFieldGroups = [
    ...(hasVehicleRegistration ? ["vehicle-registration"] : []),
    "photos",
    ...(hasVehicleRegistration ? [] : ["title"]),
    ...(hasVehicleFacts ? ["vehicle-facts"] : []),
    ...(hasVehicleFacts && storedFieldGroups.includes("description-keywords")
      ? ["description-keywords"]
      : []),
    ...(hasVehicleCondition ? ["vehicle-condition"] : []),
    ...(hasVehicleEquipment ? ["vehicle-equipment"] : []),
    ...middleOrder.filter(
      (k) =>
        !(hasVehicleFacts && k === "description-keywords") &&
        (LOCKED_FIELD_GROUP_KEYS.includes(k) || storedFieldGroups.includes(k)),
    ),
    "delivery",
    "location",
    "review-publish",
  ];

  const fieldGroupSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
  );

  const invalidate = () =>
    qc.invalidateQueries({ queryKey: ["admin", "category-flow", category.id] });

  const save = useMutation({
    mutationFn: async ({
      nextModules,
      nextFieldGroups,
    }: {
      nextModules: string[];
      nextFieldGroups: string[];
    }) => {
      const { error } = await supabase.from("category_flows").upsert(
        {
          category_id: category.id,
          field_groups: toStoredFieldGroupKeys(nextFieldGroups),
          modules: nextModules,
        },
        { onConflict: "category_id" },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Annonseflyt lagret");
      invalidate();
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre annonseflyten")),
  });

  const resetToDefault = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from("category_flows")
        .delete()
        .eq("category_id", category.id);
      if (error) throw error;
    },
    onSuccess: () => {
      showSuccessToast("Tilbakestilt til standardflyt");
      setModules(null);
      setFieldGroups(null);
      invalidate();
    },
    onError: (e: Error) =>
      showErrorToast(formatErrorMessage(e, "Kunne ikke tilbakestille annonseflyten")),
  });

  function toggle(key: string) {
    const current = modules ?? flowRow?.modules ?? DEFAULT_MODULES;
    const next = current.includes(key) ? current.filter((k) => k !== key) : [...current, key];
    setModules(next);
  }

  function toggleFieldGroup(key: string) {
    if (LOCKED_FIELD_GROUP_KEYS.includes(key)) return;
    const next = storedFieldGroups.includes(key)
      ? storedFieldGroups.filter((k) => k !== key)
      : [...storedFieldGroups, key];
    setFieldGroups(next);
  }

  function handleFieldGroupDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = middleOrder.indexOf(String(active.id));
    const newIndex = middleOrder.indexOf(String(over.id));
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(middleOrder, oldIndex, newIndex);
    setFieldGroups([
      ...(hasVehicleRegistration ? ["vehicle-registration"] : []),
      "photos",
      ...(hasVehicleRegistration ? [] : ["title"]),
      ...(hasVehicleFacts ? ["vehicle-facts"] : []),
      ...(hasVehicleFacts && storedFieldGroups.includes("description-keywords")
        ? ["description-keywords"]
        : []),
      ...(hasVehicleCondition ? ["vehicle-condition"] : []),
      ...(hasVehicleEquipment ? ["vehicle-equipment"] : []),
      ...reordered.filter(
        (k) =>
          !(hasVehicleFacts && k === "description-keywords") &&
          (LOCKED_FIELD_GROUP_KEYS.includes(k) || storedFieldGroups.includes(k)),
      ),
      "delivery",
      "location",
      "review-publish",
    ]);
  }

  return (
    <>
      <p className="text-sm text-muted-foreground">
        Velg og sorter hvilke feltgrupper og moduler som vises i annonseskjemaet for denne
        kategorien og dens underkategorier. Uten egen flyt her arves nærmeste overordnede kategoris
        flyt, eller standardflyten hvis ingen har en.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : isError ? (
        <p className="py-2 text-sm text-destructive">
          {formatErrorMessage(flowError, "Kunne ikke laste annonseflyten")}
        </p>
      ) : (
        <div className="space-y-4">
          {!hasCustomFlow && (
            <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
              Denne kategorien har ingen egen flyt ennå — bruker standardflyten (eller nærmeste
              overordnede kategoris flyt, hvis satt).
            </p>
          )}

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Feltgrupper</p>
            {hasVehicleRegistration && (
              <p className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                Denne kategorien har kjøretøyregistrering (Statens vegvesen-oppslag) satt opp via
                migrasjon. Bekreftelsessteget som vises etter et vellykket oppslag legges alltid til
                automatisk og kan ikke konfigureres her.
              </p>
            )}
            <ul>
              {hasVehicleRegistration && (
                <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                  <span className="inline-block size-4 shrink-0" aria-hidden />
                  <Checkbox checked disabled />
                  {FIELD_GROUP_LABELS_NB["vehicle-registration"]}
                  <span className="text-xs">(alltid først, kan ikke fjernes her)</span>
                </li>
              )}
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {hasVehicleRegistration
                  ? FIELD_GROUP_LABELS_NB.photos
                  : `${FIELD_GROUP_LABELS_NB.photos} & ${FIELD_GROUP_LABELS_NB.title.toLowerCase()}`}
                <span className="text-xs">(alltid først)</span>
              </li>
              {hasVehicleFacts && (
                <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                  <span className="inline-block size-4 shrink-0" aria-hidden />
                  <Checkbox checked disabled />
                  {FIELD_GROUP_LABELS_NB["vehicle-facts"]}
                  <span className="text-xs">(kjøretøyflyt, kan ikke fjernes her)</span>
                </li>
              )}
              {hasVehicleCondition && (
                <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                  <span className="inline-block size-4 shrink-0" aria-hidden />
                  <Checkbox checked disabled />
                  {FIELD_GROUP_LABELS_NB["vehicle-condition"]}
                  <span className="text-xs">(kjøretøyflyt, kan ikke fjernes her)</span>
                </li>
              )}
            </ul>
            <DndContext
              sensors={fieldGroupSensors}
              collisionDetection={closestCenter}
              onDragEnd={handleFieldGroupDragEnd}
            >
              <SortableContext items={middleOrder} strategy={verticalListSortingStrategy}>
                <ul>
                  {middleOrder.map((key) => (
                    <SortableFieldGroupRow
                      key={key}
                      id={key}
                      checked={
                        LOCKED_FIELD_GROUP_KEYS.includes(key) || storedFieldGroups.includes(key)
                      }
                      disabled={LOCKED_FIELD_GROUP_KEYS.includes(key)}
                      onToggle={() => toggleFieldGroup(key)}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
            {hasVehicleEquipment && (
              <ul>
                <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                  <span className="inline-block size-4 shrink-0" aria-hidden />
                  <Checkbox checked disabled />
                  {FIELD_GROUP_LABELS_NB["vehicle-equipment"]}
                  <span className="text-xs">
                    (kjøretøyflyt, rett under Beskrivelse, kan ikke fjernes her)
                  </span>
                </li>
              </ul>
            )}
            <ul>
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {FIELD_GROUP_LABELS_NB.delivery}
                <span className="text-xs">(påkrevd for relevante kategorier)</span>
              </li>
              <li className="flex items-center gap-2 rounded-md px-1 py-1 text-sm text-muted-foreground">
                <span className="inline-block size-4 shrink-0" aria-hidden />
                <Checkbox checked disabled />
                {FIELD_GROUP_LABELS_NB["review-publish"]}
                <span className="text-xs">(alltid sist)</span>
              </li>
            </ul>
          </div>

          <div className="space-y-1 rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
            <p className="font-medium text-foreground">Forhåndsvisning av annonseskjemaet</p>
            <FieldGroupPagesPreview
              label="Web"
              pages={resolveWizardPages(activeFieldGroups, { native: false })}
            />
            <FieldGroupPagesPreview
              label="Native"
              pages={resolveWizardPages(activeFieldGroups, { native: true })}
            />
          </div>

          <div className="space-y-1">
            <p className="text-xs font-medium text-muted-foreground">Moduler</p>
            <ul className="space-y-2">
              <li>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={activeModules.includes("generic-attributes")}
                    onCheckedChange={() => toggle("generic-attributes")}
                  />
                  Kategoriegenskaper
                </label>
              </li>
            </ul>
          </div>
        </div>
      )}

      <DialogFooter className="gap-2 sm:justify-between">
        {hasCustomFlow && (
          <Button
            type="button"
            variant="outline"
            onClick={() => resetToDefault.mutate()}
            disabled={resetToDefault.isPending}
          >
            {resetToDefault.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              "Tilbakestill til standard"
            )}
          </Button>
        )}
        <Button
          type="button"
          disabled={save.isPending || isLoading}
          onClick={() =>
            save.mutate({ nextModules: activeModules, nextFieldGroups: activeFieldGroups })
          }
        >
          {save.isPending ? <Loader2 className="size-4 animate-spin" /> : "Lagre"}
        </Button>
      </DialogFooter>
    </>
  );
}
