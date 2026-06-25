import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, ImagePlus, X, ChevronLeft, ChevronRight, Send } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { republishListing } from "@/lib/listings.functions";
import {
  geocodeNorwayAddress,
  lookupPostalCode,
  lookupCity,
  reverseGeocodeAddress,
} from "@/lib/geocode";
import { ListingLocationPicker } from "@/components/listing-location-picker";
import {
  LISTING_BUCKET,
  MAX_IMAGES,
  describeImageError,
  signListingImageUrls,
  uploadListingImage,
  validateImages,
} from "@/lib/storage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { formatErrorMessage } from "@/lib/errors";

const CONDITIONS = [
  { value: "new", label: "Helt ny" },
  { value: "like_new", label: "Som ny" },
  { value: "good", label: "Pent brukt" },
  { value: "acceptable", label: "Brukt med slitasje" },
  { value: "for_parts", label: "Må repareres" },
] as const;

const schema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(4000),
    category_id: z.string().uuid(),
    condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]),
    is_free: z.boolean(),
    price_nok: z.union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")]).optional(),
    postal_code: z
      .string()
      .trim()
      .regex(/^\d{4}$/u, "Norsk postnummer er 4 sifre")
      .optional()
      .or(z.literal("")),
    city: z.string().trim().max(100).optional().or(z.literal("")),
  })
  .refine((d) => d.is_free || (typeof d.price_nok === "number" && d.price_nok >= 0), {
    message: "Sett en pris eller marker som gratis",
    path: ["price_nok"],
  });

type FormValues = z.infer<typeof schema>;

type EditorItem =
  | { kind: "existing"; key: string; storage_path: string; url?: string }
  | { kind: "new"; key: string; file: File; previewUrl: string };

export const Route = createFileRoute("/_authenticated/mine-annonser/$id/rediger")({
  head: () => ({
    meta: [{ title: "Rediger annonse — Kaupet.no" }],
  }),
  component: EditListingPage,
});

function EditListingPage() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

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
    queryKey: ["listing-edit", id],
    queryFn: async () => {
      const [{ data, error }, { data: loc, error: locError }] = await Promise.all([
        supabase
          .from("listings")
          .select(
            "id, title, description, category_id, condition, is_free, price_nok, postal_code, city, status, listing_images(id, storage_path, sort_order)",
          )
          .eq("id", id)
          .single(),
        supabase.rpc("get_listing_owner_location", { _listing_id: id }).maybeSingle(),
      ]);
      if (error) throw error;
      if (locError) throw locError;
      return { ...data, lat: loc?.lat ?? null, lng: loc?.lng ?? null };
    },
  });

  const formValues = useMemo<FormValues | undefined>(() => {
    if (!listing) return undefined;
    return {
      title: listing.title,
      description: listing.description ?? "",
      category_id: listing.category_id ?? "",
      condition: (listing.condition as FormValues["condition"]) ?? "good",
      is_free: listing.is_free,
      price_nok: listing.price_nok ?? "",
      postal_code: listing.postal_code ?? "",
      city: listing.city ?? "",
    };
  }, [listing]);

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormValues>({
    values: formValues,
    defaultValues: {
      title: "",
      description: "",
      category_id: "",
      condition: "good",
      is_free: false,
      price_nok: "",
      postal_code: "",
      city: "",
    },
  });

  const isFree = watch("is_free");
  const categoryId = watch("category_id");
  const condition = watch("condition");
  const postalCode = watch("postal_code");
  const city = watch("city");

  const [coords, setCoords] = useState<{ lat: number; lng: number } | null>(null);
  const lastEdited = useRef<"postal_code" | "city" | "map" | null>(null);
  const markerMoved = useRef(false);
  const coordsHydratedFor = useRef<string | null>(null);

  // Initialize coords from existing listing
  useEffect(() => {
    if (!listing || coordsHydratedFor.current === listing.id) return;
    coordsHydratedFor.current = listing.id;
    if (typeof listing.lat === "number" && typeof listing.lng === "number") {
      setCoords({ lat: listing.lat, lng: listing.lng });
    }
  }, [listing]);

  // Auto-fill city from postal code
  useEffect(() => {
    if (lastEdited.current !== "postal_code") return;
    const p = (postalCode ?? "").trim();
    if (!/^\d{4}$/.test(p)) return;
    const t = window.setTimeout(async () => {
      const r = await lookupPostalCode(p);
      if (!r) return;
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (!markerMoved.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
  }, [postalCode, setValue]);

  // Auto-fill postal from city
  useEffect(() => {
    if (lastEdited.current !== "city") return;
    const c = (city ?? "").trim();
    if (c.length < 2) return;
    const t = window.setTimeout(async () => {
      const r = await lookupCity(c);
      if (!r) return;
      if (r.postal_code && !(postalCode ?? "").trim()) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
      if (!markerMoved.current) setCoords({ lat: r.lat, lng: r.lng });
    }, 500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [city, setValue]);

  // Reverse-geocode map position back to city/postal
  useEffect(() => {
    if (lastEdited.current !== "map" || !coords) return;
    const t = window.setTimeout(async () => {
      const r = await reverseGeocodeAddress(coords);
      if (r.city) setValue("city", r.city, { shouldValidate: false });
      if (r.postal_code && /^\d{4}$/.test(r.postal_code)) {
        setValue("postal_code", r.postal_code, { shouldValidate: false });
      }
    }, 300);
    return () => window.clearTimeout(t);
  }, [coords, setValue]);

  const parentCategories = (categories ?? []).filter((c) => !c.parent_id);
  const [selectedParentId, setSelectedParentId] = useState<string>("");
  const subcategories = (categories ?? []).filter((c) => c.parent_id === selectedParentId);
  const categoryHydratedFor = useRef<string | null>(null);

  // Initialize parent selector from existing category when listing loads (once)
  useEffect(() => {
    if (!listing || !categories) return;
    if (categoryHydratedFor.current === listing.id) return;
    const current = categories.find((c) => c.id === listing.category_id);
    if (!current) return;
    if (current.parent_id) {
      setSelectedParentId(current.parent_id);
    } else {
      setSelectedParentId(current.id);
    }
    categoryHydratedFor.current = listing.id;
  }, [listing, categories]);

  // Image editor state
  const [items, setItems] = useState<EditorItem[]>([]);
  const [removedPaths, setRemovedPaths] = useState<string[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hydratedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!listing || hydratedFor.current === listing.id) return;
    const sorted = [...(listing.listing_images ?? [])].sort((a, b) => a.sort_order - b.sort_order);
    const initial: EditorItem[] = sorted.map((img) => ({
      kind: "existing",
      key: img.storage_path,
      storage_path: img.storage_path,
    }));
    setItems(initial);
    hydratedFor.current = listing.id;
    if (sorted.length > 0) {
      signListingImageUrls(sorted.map((i) => i.storage_path)).then((map) => {
        setItems((curr) =>
          curr.map((it) => (it.kind === "existing" ? { ...it, url: map[it.storage_path] } : it)),
        );
      });
    }
  }, [listing]);

  useEffect(() => {
    return () => {
      items.forEach((it) => {
        if (it.kind === "new") URL.revokeObjectURL(it.previewUrl);
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = (files: File[]) => {
    const err = validateImages(files, items.length);
    if (err) {
      toast.error(describeImageError(err));
      return;
    }
    const next: EditorItem[] = files.map((file) => ({
      kind: "new",
      key: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    }));
    setItems((curr) => [...curr, ...next]);
  };

  const removeItem = (key: string) => {
    setItems((curr) => {
      const target = curr.find((i) => i.key === key);
      if (target?.kind === "new") URL.revokeObjectURL(target.previewUrl);
      if (target?.kind === "existing") {
        setRemovedPaths((paths) => [...paths, target.storage_path]);
      }
      return curr.filter((i) => i.key !== key);
    });
  };

  const move = (key: string, dir: -1 | 1) => {
    setItems((curr) => {
      const idx = curr.findIndex((i) => i.key === key);
      if (idx < 0) return curr;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= curr.length) return curr;
      const copy = [...curr];
      const [it] = copy.splice(idx, 1);
      copy.splice(newIdx, 0, it);
      return copy;
    });
  };

  const doRepublish = useServerFn(republishListing);
  const publishDraft = useMutation({
    mutationFn: () => doRepublish({ data: { id } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      toast.success("Annonsen er publisert!");
      navigate({ to: "/mine-annonser" });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke publisere annonsen")),
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const finalCoords =
        coords ??
        (await geocodeNorwayAddress({
          postal_code: parsed.postal_code,
          city: parsed.city,
        }));

      const { error: updErr } = await supabase
        .from("listings")
        .update({
          title: parsed.title,
          description: parsed.description,
          category_id: parsed.category_id,
          condition: parsed.condition,
          is_free: parsed.is_free,
          price_nok: parsed.is_free
            ? null
            : typeof parsed.price_nok === "number"
              ? parsed.price_nok
              : null,
          postal_code: parsed.postal_code || null,
          city: parsed.city || null,
          lat: finalCoords?.lat ?? null,
          lng: finalCoords?.lng ?? null,
        })
        .eq("id", id);
      if (updErr) throw updErr;

      // Images: upload new files, then replace listing_images rows.
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) throw new Error("Du må være logget inn.");

      const uploadedPaths: Record<string, string> = {};
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "new") {
          const path = await uploadListingImage({
            userId,
            listingId: id,
            index: i,
            file: it.file,
          });
          uploadedPaths[it.key] = path;
        }
      }

      // Wipe and re-insert listing_images in new order.
      const { error: delErr } = await supabase.from("listing_images").delete().eq("listing_id", id);
      if (delErr) throw delErr;

      const rows = items.map((it, idx) => ({
        listing_id: id,
        storage_path: it.kind === "existing" ? it.storage_path : uploadedPaths[it.key],
        sort_order: idx,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("listing_images").insert(rows);
        if (insErr) throw insErr;
      }

      // Best-effort: delete removed files from storage.
      if (removedPaths.length > 0) {
        await supabase.storage.from(LISTING_BUCKET).remove(removedPaths);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing-edit", id] });
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Endringer lagret");
      navigate({ to: "/mine-annonser" });
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke lagre endringene")),
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
      <h1 className="font-display text-3xl tracking-tight">Rediger annonse</h1>
      <p className="mt-1 text-muted-foreground">
        Oppdater detaljer og bilder. Endringene lagres når du trykker «Lagre endringer».
      </p>

      {listing?.status === "draft" && (
        <div className="mt-4 flex items-center gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm">
          <span className="flex-1 text-amber-800 dark:text-amber-300">
            Dette er et utkast — annonsen er ikke publisert og bare du kan se den.
          </span>
          <Button
            type="button"
            size="sm"
            onClick={() => publishDraft.mutate()}
            disabled={publishDraft.isPending}
          >
            {publishDraft.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Send className="size-4" />
            )}
            Publiser annonsen
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit((v) => mutation.mutate(v))} className="mt-8 space-y-8">
        {/* Images */}
        <section className="space-y-3">
          <Label>Bilder</Label>
          <p className="text-xs text-muted-foreground">
            {items.length} av {MAX_IMAGES} bilder. Første bilde er hovedbildet. Bruk pilene for å
            endre rekkefølge.
          </p>

          {items.length > 0 && (
            <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
              {items.map((it, idx) => {
                const src = it.kind === "existing" ? it.url : it.previewUrl;
                return (
                  <li
                    key={it.key}
                    className="group relative aspect-square overflow-hidden rounded-lg border border-border bg-muted"
                  >
                    {src ? (
                      <img
                        src={src}
                        alt={idx === 0 ? "Hovedbilde av annonsen" : `Bilde ${idx + 1} av annonsen`}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="flex size-full items-center justify-center">
                        <Loader2 className="size-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                    {idx === 0 && (
                      <span className="absolute left-2 top-2 rounded bg-primary/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-primary-foreground">
                        Hoved
                      </span>
                    )}
                    {it.kind === "new" && (
                      <span className="absolute right-2 top-2 rounded bg-accent/90 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-accent-foreground">
                        Ny
                      </span>
                    )}
                    <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition group-hover:opacity-100">
                      <div className="flex">
                        <button
                          type="button"
                          onClick={() => move(it.key, -1)}
                          className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                          disabled={idx === 0}
                          aria-label="Flytt venstre"
                        >
                          <ChevronLeft className="size-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => move(it.key, 1)}
                          className="rounded p-1 text-white hover:bg-white/20 disabled:opacity-40"
                          disabled={idx === items.length - 1}
                          aria-label="Flytt høyre"
                        >
                          <ChevronRight className="size-3.5" />
                        </button>
                      </div>
                      <button
                        type="button"
                        onClick={() => removeItem(it.key)}
                        className="rounded p-1 text-white hover:bg-destructive"
                        aria-label="Fjern bilde"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              multiple
              className="hidden"
              onChange={(e) => {
                const fl = e.target.files;
                if (fl) addFiles(Array.from(fl));
                e.target.value = "";
              }}
            />
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              disabled={items.length >= MAX_IMAGES}
            >
              <ImagePlus className="size-4" />
              Last opp bilder
            </Button>
          </div>
        </section>

        <section className="space-y-2">
          <Label htmlFor="title">Tittel</Label>
          <Input id="title" {...register("title")} />
          {errors.title && <p className="text-sm text-destructive">{errors.title.message}</p>}
        </section>

        <section className="space-y-2">
          <Label htmlFor="description">Beskrivelse</Label>
          <Textarea id="description" rows={8} {...register("description")} />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
        </section>

        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Kategori</Label>
            {!categories ? (
              <div className="flex h-10 items-center rounded-md border border-input bg-background px-3 text-sm text-muted-foreground">
                <Loader2 className="mr-2 size-4 animate-spin" /> Laster kategorier…
              </div>
            ) : (
              <>
                <Select
                  value={selectedParentId || undefined}
                  onValueChange={(v) => {
                    if (v === selectedParentId) return;
                    setSelectedParentId(v);
                    const hasSubs = categories.some((c) => c.parent_id === v);
                    if (!hasSubs) {
                      setValue("category_id", v, { shouldValidate: true });
                    } else {
                      setValue("category_id", "", { shouldValidate: false });
                    }
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Velg hovedkategori" />
                  </SelectTrigger>
                  <SelectContent>
                    {parentCategories.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name_nb}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {selectedParentId && subcategories.length > 0 && (
                  <Select
                    value={
                      categoryId && subcategories.some((c) => c.id === categoryId)
                        ? categoryId
                        : undefined
                    }
                    onValueChange={(v) => setValue("category_id", v, { shouldValidate: true })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Velg underkategori" />
                    </SelectTrigger>
                    <SelectContent>
                      {subcategories.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.name_nb}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
                {errors.category_id && <p className="text-sm text-destructive">Velg en kategori</p>}
              </>
            )}
          </div>
          <div className="space-y-2">
            <Label>Tilstand</Label>
            <Select
              value={condition || undefined}
              onValueChange={(v) =>
                setValue("condition", v as FormValues["condition"], { shouldValidate: true })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {CONDITIONS.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </section>

        <section className="space-y-3">
          <Label>Pris</Label>
          <div className="flex items-center gap-3">
            <Input
              type="number"
              min={0}
              placeholder="kr"
              disabled={isFree}
              className="max-w-[200px]"
              {...register("price_nok")}
            />
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isFree} onCheckedChange={(v) => setValue("is_free", Boolean(v))} />
              Gis bort gratis
            </label>
          </div>
          {errors.price_nok && (
            <p className="text-sm text-destructive">{errors.price_nok.message as string}</p>
          )}
        </section>

        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[160px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postnummer</Label>
              <Input
                id="postal_code"
                inputMode="numeric"
                maxLength={4}
                {...register("postal_code", {
                  onChange: () => {
                    lastEdited.current = "postal_code";
                    markerMoved.current = false;
                  },
                })}
              />
              {errors.postal_code && (
                <p className="text-sm text-destructive">{errors.postal_code.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="city">Sted</Label>
              <Input
                id="city"
                {...register("city", {
                  onChange: () => {
                    lastEdited.current = "city";
                    markerMoved.current = false;
                  },
                })}
              />
            </div>
          </div>
          {coords && (
            <div className="space-y-2">
              <p className="text-sm text-muted-foreground">
                Dra markøren for å justere hvor området vises på annonsen.
              </p>
              <ListingLocationPicker
                lat={coords.lat}
                lng={coords.lng}
                onChange={(next) => {
                  markerMoved.current = true;
                  lastEdited.current = "map";
                  setCoords(next);
                }}
              />
            </div>
          )}
        </section>

        <div className="flex items-center justify-end gap-3 border-t border-border pt-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => navigate({ to: "/mine-annonser" })}
            disabled={mutation.isPending}
          >
            Avbryt
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Lagre endringer
          </Button>
        </div>
      </form>
    </div>
  );
}
