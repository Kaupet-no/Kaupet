import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Loader2, LogOut } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";

const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Minst 2 tegn").max(80),
  bio: z.string().trim().max(500).optional().or(z.literal("")),
  location: z.string().trim().max(100).optional().or(z.literal("")),
  avatar_url: z.string().trim().url("Må være en gyldig URL").optional().or(z.literal("")),
});
type ProfileForm = z.infer<typeof profileSchema>;

const emailSchema = z.object({
  email: z.string().trim().email("Ugyldig e-postadresse"),
});
type EmailForm = z.infer<typeof emailSchema>;

const passwordSchema = z
  .object({
    password: z.string().min(8, "Minst 8 tegn"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Passordene må være like",
    path: ["confirm"],
  });
type PasswordForm = z.infer<typeof passwordSchema>;

export const Route = createFileRoute("/_authenticated/profil")({
  head: () => ({
    meta: [{ title: "Min profil — Kaupet.no" }],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    tab: (search.tab as string) === "konto" ? "konto" : "profil",
  }),
  component: ProfilePage,
});

function ProfilePage() {
  const { tab } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl tracking-tight">Min profil</h1>
      <p className="mt-1 text-muted-foreground">
        Administrer profilen og kontoinnstillingene dine.
      </p>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({ search: { tab: v === "konto" ? "konto" : "profil" }, replace: true })
        }
        className="mt-8"
      >
        <TabsList>
          <TabsTrigger value="profil">Profilinfo</TabsTrigger>
          <TabsTrigger value="konto">Konto</TabsTrigger>
        </TabsList>
        <TabsContent value="profil" className="mt-6">
          <ProfileSection />
        </TabsContent>
        <TabsContent value="konto" className="mt-6">
          <AccountSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileSection() {
  const queryClient = useQueryClient();
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const userId = userData?.id ?? null;

  const { data: profile, isLoading } = useQuery({
    queryKey: ["profile-edit", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, bio, location, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const {
    register,
    handleSubmit,
    reset,
    watch,
    formState: { errors },
  } = useForm<ProfileForm>({
    defaultValues: { display_name: "", bio: "", location: "", avatar_url: "" },
  });

  useEffect(() => {
    if (profile) {
      reset({
        display_name: profile.display_name ?? "",
        bio: profile.bio ?? "",
        location: profile.location ?? "",
        avatar_url: profile.avatar_url ?? "",
      });
    }
  }, [profile, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      if (!userId) throw new Error("Ikke innlogget");
      const parsed = profileSchema.parse(values);
      const { error } = await supabase
        .from("profiles")
        .update({
          display_name: parsed.display_name,
          bio: parsed.bio || null,
          location: parsed.location || null,
          avatar_url: parsed.avatar_url || null,
        })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-edit", userId] });
      queryClient.invalidateQueries({ queryKey: ["profile-menu", userId] });
      toast.success("Profil oppdatert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const avatarUrl = watch("avatar_url");
  const displayName = watch("display_name");

  if (isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      className="space-y-6 rounded-xl border border-border bg-card p-6"
    >
      <div className="flex items-center gap-4">
        <Avatar className="size-16">
          {avatarUrl && <AvatarImage src={avatarUrl} alt={displayName} />}
          <AvatarFallback className="bg-primary/10 text-base font-medium text-primary">
            {displayName?.slice(0, 2).toUpperCase() || "?"}
          </AvatarFallback>
        </Avatar>
        <div className="text-sm text-muted-foreground">
          Lim inn en bilde-URL nedenfor for å oppdatere avataren.
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="display_name">Visningsnavn</Label>
        <Input id="display_name" {...register("display_name")} />
        {errors.display_name && (
          <p className="text-sm text-destructive">{errors.display_name.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="avatar_url">Avatar-URL</Label>
        <Input id="avatar_url" placeholder="https://…" {...register("avatar_url")} />
        {errors.avatar_url && (
          <p className="text-sm text-destructive">{errors.avatar_url.message}</p>
        )}
      </div>
      <div className="space-y-2">
        <Label htmlFor="location">Sted</Label>
        <Input id="location" placeholder="Oslo" {...register("location")} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="bio">Om meg</Label>
        <Textarea id="bio" rows={4} {...register("bio")} />
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={mutation.isPending}>
          {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
          Lagre profil
        </Button>
      </div>
    </form>
  );
}

function AccountSection() {
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const currentEmail = userData?.email ?? "";

  const emailForm = useForm<EmailForm>({ defaultValues: { email: "" } });
  useEffect(() => {
    if (currentEmail) emailForm.reset({ email: currentEmail });
  }, [currentEmail, emailForm]);

  const passwordForm = useForm<PasswordForm>({
    defaultValues: { password: "", confirm: "" },
  });

  const emailMutation = useMutation({
    mutationFn: async (values: EmailForm) => {
      const parsed = emailSchema.parse(values);
      if (parsed.email === currentEmail) {
        throw new Error("Det er allerede din nåværende e-post");
      }
      const { error } = await supabase.auth.updateUser({ email: parsed.email });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Sjekk innboksen din for å bekrefte den nye e-posten");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const passwordMutation = useMutation({
    mutationFn: async (values: PasswordForm) => {
      const parsed = passwordSchema.parse(values);
      const { error } = await supabase.auth.updateUser({ password: parsed.password });
      if (error) throw error;
    },
    onSuccess: () => {
      passwordForm.reset();
      toast.success("Passordet er oppdatert");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="space-y-6">
      <form
        onSubmit={emailForm.handleSubmit((v) => emailMutation.mutate(v))}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-medium">E-postadresse</h2>
          <p className="text-sm text-muted-foreground">
            Vi sender en bekreftelseslenke til den nye adressen.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">E-post</Label>
          <Input id="email" type="email" {...emailForm.register("email")} />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={emailMutation.isPending}>
            {emailMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Oppdater e-post
          </Button>
        </div>
      </form>

      <form
        onSubmit={passwordForm.handleSubmit((v) => passwordMutation.mutate(v))}
        className="space-y-4 rounded-xl border border-border bg-card p-6"
      >
        <div>
          <h2 className="text-lg font-medium">Endre passord</h2>
          <p className="text-sm text-muted-foreground">Minst 8 tegn.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Nytt passord</Label>
          <Input id="password" type="password" {...passwordForm.register("password")} />
          {passwordForm.formState.errors.password && (
            <p className="text-sm text-destructive">
              {passwordForm.formState.errors.password.message}
            </p>
          )}
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">Bekreft passord</Label>
          <Input id="confirm" type="password" {...passwordForm.register("confirm")} />
          {passwordForm.formState.errors.confirm && (
            <p className="text-sm text-destructive">
              {passwordForm.formState.errors.confirm.message}
            </p>
          )}
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={passwordMutation.isPending}>
            {passwordMutation.isPending && <Loader2 className="size-4 animate-spin" />}
            Oppdater passord
          </Button>
        </div>
      </form>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-medium">Logg ut</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Avslutt økten på denne enheten.
        </p>
        <div className="mt-4 flex justify-end">
          <Button
            variant="outline"
            disabled={signingOut}
            onClick={async () => {
              setSigningOut(true);
              await supabase.auth.signOut();
              setSigningOut(false);
            }}
          >
            <LogOut className="size-4" /> Logg ut
          </Button>
        </div>
      </div>
    </div>
  );
}
