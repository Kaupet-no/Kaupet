import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { geocodeNorwayAddress } from "@/lib/geocode";
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
  { value: "for_parts", label: "Til reservedeler" },
] as const;

const schema = z
  .object({
    title: z.string().trim().min(5).max(120),
    description: z.string().trim().min(20).max(4000),
    category_id: z.string().uuid(),
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

type FormValues = z.infer<typeof schema>;

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
        .select("id, name_nb")
        .order("sort_order");
      if (error) throw error;
      return data;
    },
  });

  const { data: listing, isLoading } = useQuery({
    queryKey: ["listing-edit", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("*")
        .eq("id", id)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
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

  useEffect(() => {
    if (!listing) return;
    reset({
      title: listing.title,
      description: listing.description ?? "",
      category_id: listing.category_id ?? "",
      condition: (listing.condition as FormValues["condition"]) ?? "good",
      is_free: listing.is_free,
      price_nok: listing.price_nok ?? "",
      postal_code: listing.postal_code ?? "",
      city: listing.city ?? "",
    });
  }, [listing, reset]);

  const isFree = watch("is_free");
  const categoryId = watch("category_id");
  const condition = watch("condition");

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const parsed = schema.parse(values);
      const postalChanged = parsed.postal_code !== (listing?.postal_code ?? "");
      const cityChanged = parsed.city !== (listing?.city ?? "");
      let coords: { lat: number; lng: number } | null = null;
      if (postalChanged || cityChanged) {
        coords = await geocodeNorwayAddress({
          postal_code: parsed.postal_code,
          city: parsed.city,
        });
      }

      const { error } = await supabase
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
          ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-listings"] });
      queryClient.invalidateQueries({ queryKey: ["listing-edit", id] });
      toast.success("Endringer lagret");
      navigate({ to: "/mine-annonser" });
    },
    onError: (e: Error) => toast.error(e.message || "Kunne ikke lagre"),
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
        Oppdater detaljer. Bilder kan endres ved å opprette en ny annonse.
      </p>

      <form
        onSubmit={handleSubmit((v) => mutation.mutate(v))}
        className="mt-8 space-y-8"
      >
        <section className="space-y-2">
          <Label htmlFor="title">Tittel</Label>
          <Input id="title" {...register("title")} />
          {errors.title && (
            <p className="text-sm text-destructive">{errors.title.message}</p>
          )}
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
          </div>
          <div className="space-y-2">
            <Label>Tilstand</Label>
            <Select
              value={condition}
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

        <section className="grid gap-4 md:grid-cols-[160px_1fr]">
          <div className="space-y-2">
            <Label htmlFor="postal_code">Postnummer</Label>
            <Input
              id="postal_code"
              inputMode="numeric"
              maxLength={4}
              {...register("postal_code")}
            />
            {errors.postal_code && (
              <p className="text-sm text-destructive">{errors.postal_code.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="city">Sted</Label>
            <Input id="city" {...register("city")} />
          </div>
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
