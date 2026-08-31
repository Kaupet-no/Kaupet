import { useMemo, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { Loader2, MessageSquare, Pencil } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { nb } from "date-fns/locale";

import { NativePageHeader } from "@/components/native-page-header";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useCategories } from "@/hooks/use-categories";
import { useIsNative } from "@/hooks/use-is-native";
import { showErrorToast, showSuccessToast } from "@/lib/toast";
import { formatErrorMessage } from "@/lib/errors";
import { updateWtbListing } from "@/lib/wtb-listings.functions";
import { CategoryPicker } from "@/components/category-picker";
import { WtbCriteriaFields } from "@/features/wtb/wtb-criteria-fields";
import { WTB_FREETEXT_KEY, type WtbAttributeMap } from "@/features/wtb/wtb-criteria-types";
import { WtbEditContext, type WtbEditContextValue } from "@/features/wtb/wtb-edit-mode-context";
import { useWtbEditMutations } from "@/features/wtb/use-wtb-edit-mutations";
import { categoryBreadcrumb, type CategoryNode } from "@/lib/category-filters";
import { EditableField } from "@/features/listing-edit/editable-field";
import { EditableRegion } from "@/features/listing-edit/editable-region";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/ok/$id")({
  validateSearch: z.object({
    edit: z.coerce.boolean().optional(),
  }),
  head: () => ({
    meta: [{ title: "Ønskes kjøpt — Kaupet.no" }],
  }),
  component: WtbListingPage,
});

function WtbListingPage() {
  const { id } = Route.useParams();
  const search = Route.useSearch();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const native = useIsNative();
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const { data: listing, isLoading } = useQuery({
    queryKey: ["wtb-listing", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wtb_listings")
        .select(
          "id, user_id, title, description, category_id, max_price_nok, attributes, status, created_at",
        )
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: categories } = useCategories();
  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string }>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);
  const categoryLabel = listing?.category_id
    ? categoryBreadcrumb(listing.category_id, categoriesById) || null
    : null;

  const isOwner = !!user && !!listing && user.id === listing.user_id;
  const editModeOn = isOwner && !!search.edit;
  const { saveField, fieldStatus } = useWtbEditMutations(id);
  const editContext: WtbEditContextValue | undefined = listing
    ? { editMode: editModeOn, listingId: id, saveField, fieldStatus }
    : undefined;

  function toggleEditMode() {
    navigate({
      to: "/ok/$id",
      params: { id },
      search: (prev) => ({ ...prev, edit: !editModeOn || undefined }),
      replace: true,
    });
  }

  const updateFn = useServerFn(updateWtbListing);
  const markFulfilled = useMutation({
    mutationFn: () => updateFn({ data: { id, status: "fulfilled" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-wtb-listings"] });
      queryClient.invalidateQueries({ queryKey: ["wtb-listing", id] });
      showSuccessToast("Annonsen er markert som oppfylt");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere status")),
  });

  const { mutate: contact, isPending: contactPending } = useMutation({
    mutationFn: async () => {
      if (!listing) return null;
      if (!user) {
        navigate({ to: "/auth", search: { mode: "signin" } });
        return null;
      }
      if (listing.user_id === user.id) return null;

      const { data: existing } = await supabase
        .from("conversations")
        .select("id")
        .eq("wtb_listing_id", listing.id)
        .eq("buyer_id", listing.user_id)
        .eq("seller_id", user.id)
        .maybeSingle();
      if (existing?.id) return existing.id;

      const { data: created, error } = await supabase
        .from("conversations")
        .insert({ wtb_listing_id: listing.id, buyer_id: listing.user_id, seller_id: user.id })
        .select("id")
        .single();
      if (error) throw error;
      return created.id;
    },
    onSuccess: (convId) => {
      if (convId) navigate({ to: "/meldinger/$id", params: { id: convId } });
    },
    onError: () => showErrorToast("Kunne ikke starte samtale. Prøv igjen."),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!listing) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-20 text-center">
        <h1 className="font-display text-2xl">Fant ikke annonsen</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Den kan ha blitt fjernet, eller markert som oppfylt.
        </p>
      </div>
    );
  }

  const attributes = (listing.attributes as WtbAttributeMap) ?? {};
  const criteriaEntries = Object.entries(attributes).filter(([k]) => k !== WTB_FREETEXT_KEY);

  return (
    <WtbEditContext.Provider value={editContext ?? null}>
      <div className="mx-auto max-w-3xl px-4 py-10">
        <NativePageHeader title="Ønskes kjøpt" backTo="/mine-annonser" />
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <EditableField
              context={WtbEditContext}
              fieldKey="title"
              value={listing.title}
              render={(v) => <h1 className="font-display text-3xl tracking-tight">{v}</h1>}
              editRender={({ value, onChange, onCommit }) => (
                <Input
                  autoFocus
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={() => onCommit()}
                  onKeyDown={(e) => e.key === "Enter" && onCommit()}
                  className="font-display text-2xl"
                />
              )}
              validate={(v) => (v.trim().length < 3 ? "Tittelen må være minst 3 tegn" : null)}
              onSave={(v) => saveField({ group: "title", title: v.trim() })}
            />
            {listing.status === "fulfilled" && <Badge variant="secondary">Oppfylt</Badge>}
          </div>
          {isOwner && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={toggleEditMode}
              className="gap-2"
            >
              <Pencil className="size-4" />
              {editModeOn ? "Ferdig" : "Rediger"}
            </Button>
          )}
        </div>

        <p className="mt-1 text-sm text-muted-foreground">
          Publisert{" "}
          {formatDistanceToNow(new Date(listing.created_at), { addSuffix: true, locale: nb })}
        </p>

        {isOwner && listing.status !== "fulfilled" && (
          <div className="mt-4 flex items-center gap-3 rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm">
            <span className="flex-1 text-muted-foreground">Har du funnet det du lette etter?</span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => markFulfilled.mutate()}
              disabled={markFulfilled.isPending}
            >
              {markFulfilled.isPending && <Loader2 className="size-4 animate-spin" />}
              Marker som oppfylt
            </Button>
          </div>
        )}

        <div className="mt-8 flex flex-col gap-6">
          <section className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Kategori</span>
            <EditableRegion
              context={WtbEditContext}
              render={() =>
                categoryLabel ? (
                  <p>{categoryLabel}</p>
                ) : (
                  <p className="text-muted-foreground">Ingen kategori valgt</p>
                )
              }
              onOpen={() => setCategoryPickerOpen(true)}
              panel={() => (categoryLabel ? <p>{categoryLabel}</p> : <p>Ingen kategori valgt</p>)}
            />
            <CategoryPicker
              open={categoryPickerOpen}
              onOpenChange={setCategoryPickerOpen}
              categories={categories ?? []}
              selectedId={listing.category_id ?? ""}
              onSelect={(catId) => {
                setCategoryPickerOpen(false);
                saveField({ group: "category", category_id: catId });
              }}
            />
          </section>

          <section className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Kriterier</span>
            <EditableRegion
              context={WtbEditContext}
              className="p-3"
              render={() =>
                criteriaEntries.length === 0 ? (
                  <p className="text-sm text-muted-foreground">Ingen spesifikke krav satt</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {criteriaEntries.map(([k]) => (
                      <Badge key={k} variant="outline">
                        {k}
                      </Badge>
                    ))}
                  </div>
                )
              }
              panel={() => (
                <WtbCriteriaPanel
                  categoryId={listing.category_id}
                  categories={categories ?? []}
                  attributes={attributes}
                  native={native}
                  onSave={(next) => saveField({ group: "attributes", attributes: next })}
                />
              )}
            />
          </section>

          <section className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">Beskrivelse / krav</span>
            <EditableField
              context={WtbEditContext}
              fieldKey="description"
              value={listing.description ?? ""}
              render={(v) =>
                v ? (
                  <p className="whitespace-pre-wrap">{v}</p>
                ) : (
                  <p className="text-muted-foreground">Ingen beskrivelse</p>
                )
              }
              editRender={({ value, onChange, onCommit }) => (
                <Textarea
                  autoFocus
                  rows={3}
                  value={value}
                  onChange={(e) => onChange(e.target.value)}
                  onBlur={() => onCommit()}
                />
              )}
              onSave={(v) => saveField({ group: "description", description: v.trim() })}
            />
          </section>

          <section className="space-y-2">
            <span className="text-sm font-medium text-muted-foreground">
              Maks pris du vil betale
            </span>
            <EditableField
              context={WtbEditContext}
              fieldKey="max_price"
              value={listing.max_price_nok}
              render={(v) =>
                v != null ? (
                  <p>{v.toLocaleString("nb-NO")} kr</p>
                ) : (
                  <p className="text-muted-foreground">Ikke satt</p>
                )
              }
              editRender={({ value, onChange, onCommit }) => (
                <Input
                  autoFocus
                  type="number"
                  inputMode="numeric"
                  className="max-w-[200px]"
                  min={0}
                  max={10000000}
                  value={value ?? ""}
                  onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
                  onBlur={() => onCommit()}
                  onKeyDown={(e) => e.key === "Enter" && onCommit()}
                />
              )}
              onSave={(v) => saveField({ group: "max_price", max_price_nok: v })}
            />
          </section>
        </div>

        {!isOwner && (
          <div className="mt-8 border-t border-border pt-6">
            <Button onClick={() => contact()} disabled={contactPending} className="gap-2">
              {contactPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <MessageSquare className="size-4" />
              )}
              Kontakt
            </Button>
          </div>
        )}
      </div>
    </WtbEditContext.Provider>
  );
}

/** Criteria values are the source of truth; empty means no limitation. */
function WtbCriteriaPanel({
  categoryId,
  categories,
  attributes,
  native,
  onSave,
}: {
  categoryId: string | null;
  categories: CategoryNode[];
  attributes: WtbAttributeMap;
  native: boolean;
  onSave: (next: WtbAttributeMap) => void;
}) {
  const [checkedKeys, setCheckedKeys] = useState<string[]>(() => Object.keys(attributes));

  return (
    <WtbCriteriaFields
      categoryId={categoryId}
      categories={categories}
      value={attributes}
      onChange={onSave}
      checkedKeys={checkedKeys}
      onCheckedKeysChange={setCheckedKeys}
      native={native}
    />
  );
}
