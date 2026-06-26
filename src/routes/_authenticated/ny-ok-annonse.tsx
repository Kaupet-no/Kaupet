import { useState } from "react";
import { createFileRoute, useNavigate, useBlocker } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { ChevronLeft, ChevronRight, Search, Check, Bell } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { createWtbListing } from "@/lib/wtb-listings.functions";
import { createSavedSearch, summarizeCriteria } from "@/lib/saved-searches";
import { CategoryPicker } from "@/components/category-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { formatErrorMessage } from "@/lib/errors";
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

const wtbSchema = z.object({
  title: z.string().trim().min(3, "Tittelen må være minst 3 tegn").max(120, "Maks 120 tegn"),
  description: z.string().trim().max(2000, "Maks 2000 tegn").optional().or(z.literal("")),
  category_id: z.string().uuid().nullable().optional(),
  max_price_nok: z
    .union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")])
    .optional(),
});

type WtbForm = z.infer<typeof wtbSchema>;

export const Route = createFileRoute("/_authenticated/ny-ok-annonse")({
  head: () => ({
    meta: [
      { title: "Ønskes kjøpt — Kaupet.no" },
      {
        name: "description",
        content: "Legg ut en ønskes kjøpt-annonse og finn det du leter etter på Kaupet.no.",
      },
    ],
  }),
  component: NewWtbPage,
});

function NewWtbPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<1 | 2>(1);
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);
  const [categoryName, setCategoryName] = useState("");
  const [savingSearch, setSavingSearch] = useState(false);
  const [savedSearch, setSavedSearch] = useState(false);
  const [createdId, setCreatedId] = useState<string | null>(null);
  const [wantSaveSearch, setWantSaveSearch] = useState(true);

  const { data: categories = [] } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, slug, name_nb, parent_id")
        .order("sort_order")
        .order("name_nb");
      if (error) throw error;
      return data ?? [];
    },
  });

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors },
  } = useForm<WtbForm>({
    resolver: zodResolver(wtbSchema),
    defaultValues: { title: "", description: "", category_id: null, max_price_nok: "" },
  });

  const categoryId = watch("category_id");
  const title = watch("title");

  const shouldBlockNav = step === 1 && title.trim().length > 0;
  const blocker = useBlocker({
    shouldBlockFn: () => shouldBlockNav,
    withResolver: true,
    enableBeforeUnload: shouldBlockNav,
  });

  const createFn = useServerFn(createWtbListing);
  const { mutate: publish, isPending } = useMutation({
    mutationFn: async (values: WtbForm) => {
      const result = await createFn({
        data: {
          title: values.title,
          description: values.description || undefined,
          category_id: values.category_id ?? null,
          max_price_nok: typeof values.max_price_nok === "number" ? values.max_price_nok : null,
        },
      });
      return result.id;
    },
    onSuccess: (id) => {
      setCreatedId(id);
      setStep(2);
    },
    onError: (err) =>
      showErrorToast(formatErrorMessage(err, "Kunne ikke publisere annonsen. Prøv igjen.")),
  });

  const handleSaveSearch = async () => {
    if (!createdId) return;
    setSavingSearch(true);
    try {
      const criteria = {
        q: title.trim() || undefined,
        categories: categoryId ? [categoryId] : undefined,
      };
      const name = summarizeCriteria(criteria) || title.trim();
      await createSavedSearch(name, criteria, true);
      setSavedSearch(true);
      showSuccessToast("Søk lagret! Du varsles når noen legger ut en matching annonse.");
    } catch {
      showErrorToast("Kunne ikke lagre søket. Prøv igjen.");
    } finally {
      setSavingSearch(false);
    }
  };

  if (step === 2) {
    return (
      <div className="mx-auto flex min-h-[60vh] max-w-lg flex-col items-center justify-center gap-6 px-4 py-12 text-center">
        <div className="flex size-16 items-center justify-center rounded-full bg-primary/10">
          <Check className="size-8 text-primary" />
        </div>
        <div className="flex flex-col gap-2">
          <h1 className="text-xl font-bold">Ønskes kjøpt-annonse publisert!</h1>
          <p className="text-muted-foreground">
            Andre brukere som selger noe som matcher vil se at du er interessert.
          </p>
        </div>

        {!savedSearch && (
          <div className="w-full rounded-xl border bg-muted/40 p-4 text-left">
            <div className="mb-3 flex items-start gap-3">
              <Bell className="mt-0.5 size-5 shrink-0 text-primary" />
              <div>
                <p className="font-medium">Vil du varsles om matchende annonser?</p>
                <p className="text-sm text-muted-foreground">
                  Vi sender deg et varsel når noen legger ut noe som treffer søket ditt.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Checkbox
                id="wantSave"
                checked={wantSaveSearch}
                onCheckedChange={(v) => setWantSaveSearch(!!v)}
              />
              <Label htmlFor="wantSave" className="cursor-pointer text-sm">
                Ja, lagre søk og send varsler
              </Label>
            </div>
            <Button
              className="mt-3 w-full"
              onClick={handleSaveSearch}
              disabled={!wantSaveSearch || savingSearch}
            >
              {savingSearch ? "Lagrer..." : "Lagre søk"}
            </Button>
          </div>
        )}

        {savedSearch && (
          <div className="flex items-center gap-2 text-sm text-green-600">
            <Check className="size-4" />
            Søk lagret — du varsles ved treff!
          </div>
        )}

        <div className="flex w-full flex-col gap-2">
          <Button onClick={() => navigate({ to: "/annonser" })}>Se alle annonser</Button>
          <Button variant="outline" onClick={() => navigate({ to: "/mine-annonser" })}>
            Mine annonser
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-8">
      <div className="mb-6 flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate({ to: "/ny-annonse" })}>
          <ChevronLeft className="size-5" />
        </Button>
        <div>
          <h1 className="text-lg font-bold">Ønskes kjøpt</h1>
          <p className="text-sm text-muted-foreground">
            Fortell hva du leter etter, så finner selgere deg.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit((values) => publish(values))} className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="title">
            Hva leter du etter? <span className="text-destructive">*</span>
          </Label>
          <Input
            id="title"
            placeholder="f.eks. PlayStation 5, Trek sykkel, iPhone 14..."
            autoFocus
            {...register("title")}
          />
          {errors.title && <p className="text-xs text-destructive">{errors.title.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label>Kategori</Label>
          <button
            type="button"
            onClick={() => setCategoryPickerOpen(true)}
            className="flex h-10 w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background hover:bg-accent"
          >
            <span className={categoryName ? "text-foreground" : "text-muted-foreground"}>
              {categoryName || "Velg kategori (valgfritt)"}
            </span>
            <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="max_price">Maks pris du vil betale (kr)</Label>
          <Input
            id="max_price"
            type="number"
            inputMode="numeric"
            placeholder="f.eks. 2500"
            min={0}
            max={10000000}
            {...register("max_price_nok")}
          />
          {errors.max_price_nok && (
            <p className="text-xs text-destructive">{errors.max_price_nok.message}</p>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="description">Beskrivelse / krav (valgfritt)</Label>
          <Textarea
            id="description"
            placeholder="Beskriv gjerne ønsket stand, farge, versjon, o.l."
            rows={3}
            {...register("description")}
          />
          {errors.description && (
            <p className="text-xs text-destructive">{errors.description.message}</p>
          )}
        </div>

        <Button type="submit" disabled={isPending} className="gap-2">
          {isPending ? (
            "Publiserer..."
          ) : (
            <>
              <Search className="size-4" />
              Publiser ønskes kjøpt
            </>
          )}
        </Button>
      </form>

      <CategoryPicker
        open={categoryPickerOpen}
        onOpenChange={setCategoryPickerOpen}
        categories={categories}
        selectedId={categoryId ?? ""}
        onSelect={(id, _parentId) => {
          setValue("category_id", id);
          const cat = categories.find((c) => c.id === id);
          setCategoryName(cat?.name_nb ?? "");
          setCategoryPickerOpen(false);
        }}
      />

      <AlertDialog
        open={blocker.status === "blocked"}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Avbryte annonsen?</AlertDialogTitle>
            <AlertDialogDescription>
              Du er i ferd med å forlate siden. Endringene dine vil gå tapt.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => blocker.reset?.()}>
              Fortsett å redigere
            </AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => blocker.proceed?.()}
            >
              Ja, avbryt
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
