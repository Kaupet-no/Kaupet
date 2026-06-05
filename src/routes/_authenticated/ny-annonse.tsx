import { useEffect, useRef, useState } from "react";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { uploadListingImage } from "@/lib/storage";
import { geocodeNorwayAddress, lookupPostalCode, lookupCity, reverseGeocodeAddress } from "@/lib/geocode";
import { ImageUploader, type PendingImage } from "@/components/image-uploader";
import { ListingLocationPicker } from "@/components/listing-location-picker";
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

const CONDITIONS = [
  { value: "new", label: "Helt ny" },
  { value: "like_new", label: "Som ny" },
  { value: "good", label: "Pent brukt" },
  { value: "acceptable", label: "Brukt med slitasje" },
  { value: "for_parts", label: "Må repareres" },
] as const;

const listingSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(5, "Tittelen må være minst 5 tegn")
      .max(120, "Maks 120 tegn"),
    description: z
      .string()
      .trim()
      .min(20, "Skriv litt mer — minst 20 tegn")
      .max(4000, "Maks 4000 tegn"),
    category_id: z.string().uuid("Velg en kategori"),
    condition: z.enum(["new", "like_new", "good", "acceptable", "for_parts"]),
    is_free: z.boolean(),
    price_nok: z
      .union([z.coerce.number().int().min(0).max(10_000_000), z.literal("")])
      .optional(),
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

type ListingForm = z.infer<typeof listingSchema>;

export const Route = createFileRoute("/_authenticated/ny-annonse")({
  head: () => ({
    meta: [
      { title: "Ny annonse — Kaupet.no" },
      { name: "description", content: "Legg ut en gratis annonse på Kaupet.no." },
    ],
  }),
  component: NewListingPage,
});

function NewListingPage() {
  const navigate = useNavigate();
  const [images, setImages] = useState<PendingImage[]>([]);

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<ListingForm>({
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

  const mutation = useMutation({
    mutationFn: async (values: ListingForm) => {
      const parsed = listingSchema.parse(values);
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (userErr || !userData.user) throw new Error("Du må være logget inn.");
      const userId = userData.user.id;

      // Bruk manuelt valgte koordinater (kart eller geokoding fra auto-fyll) hvis tilgjengelig.
      const finalCoords =
        coords ??
        (await geocodeNorwayAddress({
          postal_code: parsed.postal_code,
          city: parsed.city,
        }));

      const { data: listing, error: insertErr } = await supabase
        .from("listings")
        .insert({
          seller_id: userId,
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
          status: "active",
          published_at: new Date().toISOString(),
        })
        .select("id")
        .single();
      if (insertErr) throw insertErr;

      // Upload images sequentially to avoid hammering storage
      const uploaded: { storage_path: string; sort_order: number }[] = [];
      for (let i = 0; i < images.length; i++) {
        const path = await uploadListingImage({
          userId,
          listingId: listing.id,
          index: i,
          file: images[i].file,
        });
        uploaded.push({ storage_path: path, sort_order: i });
      }
      if (uploaded.length > 0) {
        const { error: imgErr } = await supabase.from("listing_images").insert(
          uploaded.map((u) => ({
            listing_id: listing.id,
            storage_path: u.storage_path,
            sort_order: u.sort_order,
          })),
        );
        if (imgErr) throw imgErr;
      }
      return listing.id as string;
    },
    onSuccess: (id) => {
      toast.success("Annonsen er publisert");
      navigate({ to: "/annonse/$id", params: { id } });
    },
    onError: (err: Error) => {
      toast.error(err.message || "Kunne ikke publisere annonsen");
    },
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10">
      <h1 className="font-display text-3xl tracking-tight">Ny annonse</h1>
      <p className="mt-1 text-muted-foreground">
        Det er gratis å legge ut annonser. Fyll inn det viktigste — du kan redigere senere.
      </p>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="mt-8 space-y-8"
      >
        {/* Images */}
        <section className="space-y-2">
          <Label>Bilder</Label>
          <ImageUploader images={images} onChange={setImages} />
        </section>

        {/* Title */}
        <section className="space-y-2">
          <Label htmlFor="title">Tittel</Label>
          <Input
            id="title"
            placeholder="F.eks. Stokke Tripp Trapp barnestol — eik"
            {...register("title")}
          />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
        </section>

        {/* Description */}
        <section className="space-y-2">
          <Label htmlFor="description">Beskrivelse</Label>
          <Textarea
            id="description"
            rows={8}
            placeholder="Beskriv tilstand, alder, hvorfor du selger, og om henting/sending."
            {...register("description")}
          />
          {errors.description && (
            <p className="text-sm text-destructive">{errors.description.message}</p>
          )}
        </section>

        {/* Category + condition */}
        <section className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Kategori</Label>
            <Select
              value={categoryId}
              onValueChange={(v) => setValue("category_id", v, { shouldValidate: true })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Velg kategori" />
              </SelectTrigger>
              <SelectContent>
                {(categories ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name_nb}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.category_id && (
              <p className="text-sm text-destructive">{errors.category_id.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label>Tilstand</Label>
            <Select
              value={condition}
              onValueChange={(v) =>
                setValue("condition", v as ListingForm["condition"], { shouldValidate: true })
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

        {/* Price */}
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
              <Checkbox
                checked={isFree}
                onCheckedChange={(v) => setValue("is_free", Boolean(v))}
              />
              Gis bort gratis
            </label>
          </div>
          {errors.price_nok && (
            <p className="text-sm text-destructive">
              {errors.price_nok.message as string}
            </p>
          )}
        </section>

        {/* Location */}
        <section className="space-y-4">
          <div className="grid gap-4 md:grid-cols-[160px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="postal_code">Postnummer</Label>
              <Input
                id="postal_code"
                inputMode="numeric"
                maxLength={4}
                placeholder="0150"
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
                placeholder="Oslo"
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
            onClick={() => navigate({ to: "/" })}
            disabled={mutation.isPending}
          >
            Avbryt
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Publiser annonse
          </Button>
        </div>
      </form>
    </div>
  );
}
