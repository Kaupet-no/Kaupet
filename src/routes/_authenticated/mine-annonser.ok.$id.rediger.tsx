import { useEffect, useMemo, useRef, useState } from "react";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { NativePageHeader } from "@/components/native-page-header";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { ChevronDown, Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { updateWtbListing } from "@/lib/wtb-listings.functions";
import { CategoryPicker } from "@/components/category-picker";
import { useAllCategoryFilters } from "@/components/attribute-fields";
import { WtbCriteriaFields } from "@/features/wtb/wtb-criteria-fields";
import { wtbInvalidCheckedKeys, type WtbAttributeMap } from "@/features/wtb/wtb-criteria-types";
import {
  categoryBreadcrumb,
  vehicleCategoryGroupFor,
  type CategoryNode,
} from "@/lib/category-filters";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { formatErrorMessage } from "@/lib/errors";

const wtbSchema = z.object({
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z
    .union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")])
    .optional(),
});
type WtbForm = z.infer<typeof wtbSchema>;

export const Route = createFileRoute("/_authenticated/mine-annonser/ok/$id/rediger")({
  head: () => ({
    meta: [{ title: "Rediger ønskes kjøpt — Kaupet.no" }],
  }),
  component: EditWtbPage,
});

function EditWtbPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [attributes, setAttributes] = useState<WtbAttributeMap>({});
  const [checkedKeys, setCheckedKeys] = useState<string[]>([]);
  const [showCriteriaErrors, setShowCriteriaErrors] = useState(false);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, parent_id")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: listing, isLoading } = useQuery({
    queryKey: ["wtb-listing-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("wtb_listings")
        .select("id, title, subtitle, description, category_id, max_price_nok, attributes, status")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const formValues = useMemo<WtbForm | undefined>(() => {
    if (!listing) return undefined;
    return {
      title: listing.title,
      description: listing.description ?? "",
      category_id: listing.category_id ?? null,
      max_price_nok: listing.max_price_nok ?? "",
    };
  }, [listing]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isDirty },
  } = useForm<WtbForm>({
    resolver: zodResolver(wtbSchema),
    values: formValues,
    defaultValues: {
      title: "",
      description: "",
      category_id: null,
      max_price_nok: "",
    },
  });

  const categoryId = watch("category_id");

  const categoriesById = useMemo(() => {
    const m = new Map<string, CategoryNode & { name_nb: string }>();
    for (const c of categories ?? []) m.set(c.id, c);
    return m;
  }, [categories]);
  const categoryLabel = categoryId ? categoryBreadcrumb(categoryId, categoriesById) || null : null;
  const { data: allFilters } = useAllCategoryFilters();
  const vehicleGroup = useMemo(
    () => vehicleCategoryGroupFor(categoryId ?? null, allFilters ?? [], categoriesById),
    [categoryId, allFilters, categoriesById],
  );

  const attributesHydratedFor = useMemo(() => listing?.id, [listing?.id]);
  useEffect(() => {
    if (listing?.attributes && typeof listing.attributes === "object") {
      setAttributes(listing.attributes as WtbAttributeMap);
      setCheckedKeys(Object.keys(listing.attributes));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attributesHydratedFor]);

  const updateFn = useServerFn(updateWtbListing);

  // Unsaved-changes guard: form dirty or attributes changed after hydration.
  const attributesDirtyRef = useRef(false);
  const skipGuardRef = useRef(false);
  const hasUnsavedChanges = (isDirty || attributesDirtyRef.current) && !skipGuardRef.current;
  const blocker = useBlocker({
    shouldBlockFn: () => hasUnsavedChanges,
    withResolver: true,
    enableBeforeUnload: hasUnsavedChanges,
  });

  const mutation = useMutation({
    mutationFn: (values: WtbForm) =>
      updateFn({
        data: {
          id,
          title: values.title,
          description: values.description || undefined,
          category_id: values.category_id ?? null,
          max_price_nok: typeof values.max_price_nok === "number" ? values.max_price_nok : null,
          attributes,
        },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-wtb-listings"] });
      queryClient.invalidateQueries({ queryKey: ["wtb-listing-edit", id] });
      showSuccessToast("Endringer lagret");
      skipGuardRef.current = true;
      navigate({ to: "/mine-annonser" });
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre endringene")),
  });

  const markFulfilled = useMutation({
    mutationFn: () => updateFn({ data: { id, status: "fulfilled" } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-wtb-listings"] });
      queryClient.invalidateQueries({ queryKey: ["wtb-listing-edit", id] });
      showSuccessToast("Annonsen er markert som oppfylt");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke oppdatere status")),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <NativePageHeader title="Rediger ønskes kjøpt" backTo="/mine-annonser" />
      <div className="flex items-center gap-3">
        <h1 className="font-display text-3xl tracking-tight">Rediger ønskes kjøpt</h1>
        {listing?.status === "fulfilled" && <Badge variant="secondary">Oppfylt</Badge>}
      </div>

      {listing?.status !== "fulfilled" && (
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

      <form
        onSubmit={handleSubmit((v) => {
          if (wtbInvalidCheckedKeys(checkedKeys, attributes).length > 0) {
            setShowCriteriaErrors(true);
            return;
          }
          mutation.mutate(v);
        })}
        className="mt-8 flex flex-col gap-6"
      >
        <section className="space-y-2">
          <Label htmlFor="title">{vehicleGroup ? "Tittel" : "Hva leter du etter?"}</Label>
          <Input id="title" {...register("title")} />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </section>

        <section className="space-y-2">
          <Label>Kategori (valgfritt)</Label>
          {!categories ? (
            <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
              <Loader2 className="mr-2 size-4 animate-spin" /> Laster kategorier…
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setCategoryPickerOpen(true)}
                className="flex w-full items-center justify-between rounded-md border border-border bg-card px-3 py-2 text-sm transition-colors hover:border-primary/40"
              >
                <span className={categoryLabel ? "text-foreground" : "text-muted-foreground"}>
                  {categoryLabel ?? "Velg kategori..."}
                </span>
                <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
              </button>
              <CategoryPicker
                open={categoryPickerOpen}
                onOpenChange={setCategoryPickerOpen}
                categories={categories}
                selectedId={categoryId ?? ""}
                onSelect={(catId) => setValue("category_id", catId)}
              />
            </>
          )}
          <WtbCriteriaFields
            categoryId={categoryId ?? null}
            categories={categories ?? []}
            value={attributes}
            onChange={(next) => {
              attributesDirtyRef.current = true;
              setAttributes(next);
            }}
            checkedKeys={checkedKeys}
            onCheckedKeysChange={setCheckedKeys}
            showErrors={showCriteriaErrors}
          />
        </section>

        <section className="space-y-2">
          <Label htmlFor="description">Beskrivelse / krav (valgfritt)</Label>
          <Textarea id="description" rows={3} {...register("description")} />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
        </section>

        <section className="space-y-2">
          <Label htmlFor="max_price">Maks pris du vil betale (valgfritt)</Label>
          <Input
            id="max_price"
            type="number"
            inputMode="numeric"
            className="max-w-[200px]"
            min={0}
            max={10000000}
            {...register("max_price_nok")}
          />
          {errors.max_price_nok && (
            <p className="text-sm text-destructive">{errors.max_price_nok.message}</p>
          )}
        </section>

        <div className="flex items-center justify-between border-t border-border pt-6">
          <Button type="button" variant="ghost" onClick={() => navigate({ to: "/mine-annonser" })}>
            Avbryt
          </Button>
          <Button type="submit" disabled={mutation.isPending} className="gap-2">
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lagre endringer
          </Button>
        </div>
      </form>

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Du har ulagrede endringer</AlertDialogTitle>
            <AlertDialogDescription>
              Hvis du forlater siden nå, mister du endringene du har gjort.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => blocker.proceed?.()}
            >
              Forkast endringer
            </AlertDialogAction>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Fortsett å redigere
            </AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
