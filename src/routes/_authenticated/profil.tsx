import { useEffect, useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import { Bell, Loader2, LogOut, Trash2, ShieldOff } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useNavigate } from "@tanstack/react-router";
import {
  getCurrentEndpoint,
  getPermissionState,
  pushSupported,
  subscribe as subscribePush,
  unsubscribeThisDevice,
} from "@/lib/push";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/push.functions";
import { listMyBlocks, deleteBlock } from "@/lib/blocks.functions";



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
  validateSearch: (search: Record<string, unknown>) => {
    const t = search.tab as string;
    return {
      tab:
        t === "konto" || t === "varslinger" || t === "blokkerte"
          ? t
          : "profil",
    };
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { tab, vipps, reason } = Route.useSearch();
  const navigate = Route.useNavigate();

  useEffect(() => {
    if (vipps === "ok") {
      toast.success("Identiteten din er bekreftet med Vipps");
      navigate({ search: { tab }, replace: true });
    } else if (vipps === "error") {
      toast.error(
        reason === "not_configured"
          ? "Vipps-pålogging er ikke konfigurert ennå"
          : "Vipps-verifisering mislyktes. Prøv igjen.",
      );
      navigate({ search: { tab }, replace: true });
    }
  }, [vipps, reason, tab, navigate]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl tracking-tight">Min profil</h1>
      <p className="mt-1 text-muted-foreground">
        Administrer profilen og kontoinnstillingene dine.
      </p>

      <Tabs
        value={tab}
        onValueChange={(v) =>
          navigate({
            search: {
              tab:
                v === "konto" || v === "varslinger" || v === "blokkerte"
                  ? (v as "konto" | "varslinger" | "blokkerte")
                  : "profil",
            },
            replace: true,
          })
        }
        className="mt-8"
      >
        <TabsList>
          <TabsTrigger value="profil">Profilinfo</TabsTrigger>
          <TabsTrigger value="varslinger">Varslinger</TabsTrigger>
          <TabsTrigger value="blokkerte">Blokkerte</TabsTrigger>
          <TabsTrigger value="konto">Konto</TabsTrigger>
        </TabsList>
        <TabsContent value="profil" className="mt-6 space-y-6">
          <VerificationSection />
          <ProfileSection />
        </TabsContent>
        <TabsContent value="varslinger" className="mt-6">
          <NotificationsSection />
        </TabsContent>
        <TabsContent value="blokkerte" className="mt-6">
          <BlockedSection />
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
  const getMyVerificationFn = useServerFn(getMyVerification);
  const { data: userData } = useQuery({
    queryKey: ["current-user"],
    queryFn: async () => {
      const { data } = await supabase.auth.getUser();
      return data.user;
    },
  });
  const userId = userData?.id ?? null;

  const { data: verification } = useQuery({
    queryKey: ["my-verification"],
    queryFn: () => getMyVerificationFn(),
  });
  const isLocked = !!verification?.is_valid;

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
      const updates: {
        bio: string | null;
        location: string | null;
        avatar_url: string | null;
        display_name?: string;
      } = {
        bio: parsed.bio || null,
        location: parsed.location || null,
        avatar_url: parsed.avatar_url || null,
      };
      if (!isLocked) updates.display_name = parsed.display_name;
      const { error } = await supabase
        .from("profiles")
        .update(updates)
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
        <Input id="display_name" {...register("display_name")} disabled={isLocked} />
        {isLocked && (
          <p className="text-xs text-muted-foreground">
            Låst til navnet fra Vipps. Avverifiser øverst for å endre.
          </p>
        )}
        {errors.display_name && !isLocked && (
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

      <DeleteAccountSection currentEmail={currentEmail} />
    </div>
  );
}

function DeleteAccountSection({ currentEmail }: { currentEmail: string }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const canConfirm =
    !!currentEmail &&
    confirmation.trim().toLowerCase() === currentEmail.trim().toLowerCase();

  async function handleDelete() {
    if (!canConfirm) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("request_account_deletion", {
      _email: confirmation.trim(),
    });
    if (error) {
      setSubmitting(false);
      toast.error(error.message);
      return;
    }
    await supabase.auth.signOut();
    setSubmitting(false);
    setOpen(false);
    toast.success(
      "Kontoen din er satt inaktiv. Den slettes permanent om 7 dager hvis du ikke logger inn igjen.",
    );
    navigate({ to: "/" });
  }

  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6">
      <h2 className="text-lg font-medium text-destructive">Slett konto</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Sletter kontoen din og dine personopplysninger. Annonsene dine fjernes helt.
        Tidligere meldinger du har sendt vil fortsatt være synlige for mottakerne,
        men avsendernavnet endres til «Slettet bruker».
        Av sikkerhetshensyn settes kontoen først inaktiv i 7 dager. Logger du inn igjen
        innen denne perioden, avbrytes slettingen automatisk. Etter 7 dager slettes
        kontoen permanent og kan ikke gjenopprettes.
      </p>
      <div className="mt-4 flex justify-end">
        <AlertDialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setConfirmation(""); }}>
          <AlertDialogTrigger asChild>
            <Button variant="destructive">
              <Trash2 className="size-4" /> Slett konto
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Er du sikker på at du vil slette kontoen?</AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3 text-sm text-muted-foreground">
                  <p>
                    Kontoen din blir satt inaktiv umiddelbart, og du logges ut. Alle dine
                    annonser arkiveres og blir ikke lenger synlige for andre.
                  </p>
                  <p>
                    Innen <strong>7 dager</strong> kan du gjenopprette kontoen ved å logge
                    inn på nytt. Etter 7 dager slettes profilen din permanent — annonsene
                    dine fjernes, men meldinger du har sendt blir værende hos mottakerne
                    med avsendernavnet <em>«Slettet bruker»</em>.
                  </p>
                  <p>
                    Skriv inn e-postadressen din (<strong>{currentEmail}</strong>) for å
                    bekrefte:
                  </p>
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="space-y-2">
              <Label htmlFor="delete-confirm-email" className="sr-only">
                Bekreft e-post
              </Label>
              <Input
                id="delete-confirm-email"
                type="email"
                autoComplete="off"
                placeholder="din@epost.no"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
              />
            </div>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={submitting}>Avbryt</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => {
                  e.preventDefault();
                  void handleDelete();
                }}
                disabled={!canConfirm || submitting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {submitting && <Loader2 className="size-4 animate-spin" />}
                Slett kontoen min
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  );
}

function NotificationsSection() {
  const queryClient = useQueryClient();
  const supported = pushSupported();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    () => getPermissionState(),
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "subscribe" | "unsubscribe">(null);

  const getPrefs = useServerFn(getNotificationPreferences);
  const updatePrefs = useServerFn(updateNotificationPreferences);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => getPrefs({}),
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ep = await getCurrentEndpoint();
      if (!cancelled) setEndpoint(ep);
    })();
    return () => {
      cancelled = true;
    };
  }, [permission]);

  const mutation = useMutation({
    mutationFn: async (values: {
      web_push_messages: boolean;
      web_push_saved_searches: boolean;
    }) => {
      await updatePrefs({ data: values });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Innstillingene er lagret");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function handleSubscribe() {
    setBusy("subscribe");
    try {
      await subscribePush();
      setPermission(getPermissionState());
      const ep = await getCurrentEndpoint();
      setEndpoint(ep);
      toast.success("Push-varsler er aktivert på denne enheten");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klarte ikke å aktivere varsler");
    } finally {
      setBusy(null);
    }
  }

  async function handleUnsubscribe() {
    setBusy("unsubscribe");
    try {
      await unsubscribeThisDevice();
      setEndpoint(null);
      toast.success("Denne enheten mottar ikke lenger push-varsler");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Klarte ikke å deaktivere");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="flex items-start gap-3">
          <Bell className="mt-0.5 size-5 text-primary" />
          <div className="flex-1">
            <h2 className="text-lg font-medium">Push-varsler i nettleseren</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Få varsler om nye meldinger og treff i lagrede søk selv når Kaupet.no ikke
              er åpen. På iPhone må du først legge til Kaupet.no på hjem-skjermen.
            </p>

            {!supported ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Push-varsler er ikke tilgjengelig i denne nettleseren eller i Lovable-forhåndsvisningen.
                Åpne <strong>kaupet.no</strong> direkte for å aktivere.
              </p>
            ) : permission === "denied" ? (
              <p className="mt-4 text-sm text-destructive">
                Du har blokkert varsler for kaupet.no. Endre tillatelsen i nettleserinnstillingene
                for å aktivere på nytt.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {endpoint ? (
                  <Button
                    variant="outline"
                    onClick={handleUnsubscribe}
                    disabled={busy !== null}
                  >
                    {busy === "unsubscribe" && <Loader2 className="size-4 animate-spin" />}
                    Deaktiver på denne enheten
                  </Button>
                ) : (
                  <Button onClick={handleSubscribe} disabled={busy !== null}>
                    {busy === "subscribe" && <Loader2 className="size-4 animate-spin" />}
                    Aktiver push-varsler
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-6">
        <h2 className="text-lg font-medium">Hva vil du varsles om?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Disse innstillingene gjelder for alle enhetene dine.
        </p>

        {isLoading || !prefs ? (
          <Loader2 className="mt-4 size-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="mt-6 space-y-5">
            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pref-messages" className="text-sm font-medium">
                  Nye chat-meldinger
                </Label>
                <p className="text-sm text-muted-foreground">
                  Varsel når noen sender deg en melding om en annonse.
                </p>
              </div>
              <Switch
                id="pref-messages"
                checked={prefs.web_push_messages}
                disabled={mutation.isPending}
                onCheckedChange={(v) =>
                  mutation.mutate({
                    web_push_messages: v,
                    web_push_saved_searches: prefs.web_push_saved_searches,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pref-searches" className="text-sm font-medium">
                  Treff i lagrede søk
                </Label>
                <p className="text-sm text-muted-foreground">
                  Varsel når en ny annonse matcher et av søkene dine.
                </p>
              </div>
              <Switch
                id="pref-searches"
                checked={prefs.web_push_saved_searches}
                disabled={mutation.isPending}
                onCheckedChange={(v) =>
                  mutation.mutate({
                    web_push_messages: prefs.web_push_messages,
                    web_push_saved_searches: v,
                  })
                }
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function BlockedSection() {
  const qc = useQueryClient();
  const listFn = useServerFn(listMyBlocks);
  const deleteFn = useServerFn(deleteBlock);

  const { data: blocks, isLoading } = useQuery({
    queryKey: ["my-blocks"],
    queryFn: () => listFn(),
  });

  const unblock = useMutation({
    mutationFn: async (blockId: string) => deleteFn({ data: { blockId } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["my-blocks"] });
      toast.success("Blokkering opphevet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) {
    return <Loader2 className="size-5 animate-spin text-muted-foreground" />;
  }

  if (!blocks || blocks.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center text-sm text-muted-foreground">
        Du har ikke blokkert noen brukere eller samtaler.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Brukere og samtaler du har blokkert. Opphev blokkeringen for å kunne sende
        og motta meldinger igjen.
      </p>
      <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {blocks.map((b) => (
          <li key={b.id} className="flex items-center gap-3 p-4">
            <Avatar className="size-10">
              {b.blocked_profile?.avatar_url && (
                <AvatarImage
                  src={b.blocked_profile.avatar_url}
                  alt={b.blocked_profile.display_name ?? ""}
                />
              )}
              <AvatarFallback className="bg-muted text-xs">
                {(b.blocked_profile?.display_name ?? "?")
                  .slice(0, 2)
                  .toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {b.blocked_profile?.display_name ?? "Ukjent bruker"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {b.scope === "all"
                  ? "All kommunikasjon blokkert"
                  : `Samtale blokkert${b.listing ? ` · ${b.listing.title}` : ""}`}
                {" · "}
                {new Date(b.created_at).toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                })}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={unblock.isPending}
              onClick={() => unblock.mutate(b.id)}
              className="gap-2"
            >
              {unblock.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <ShieldOff className="size-4" />
              )}
              Opphev
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}




function VerificationSection() {
  const queryClient = useQueryClient();
  const enabledFn = useServerFn(isVippsEnabled);
  const getMyVerificationFn = useServerFn(getMyVerification);
  const startFn = useServerFn(startVippsVerification);
  const unverifyFn = useServerFn(unverifyVipps);

  const { data: enabled } = useQuery({
    queryKey: ["vipps-enabled"],
    queryFn: () => enabledFn(),
  });

  const { data: verification, isLoading } = useQuery({
    queryKey: ["my-verification"],
    queryFn: () => getMyVerificationFn(),
  });

  const startMutation = useMutation({
    mutationFn: () => startFn(),
    onSuccess: (res) => {
      window.location.href = res.url;
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const unverifyMutation = useMutation({
    mutationFn: () => unverifyFn(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["my-verification"] });
      toast.success("Verifiseringen er fjernet");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const isVerified = !!verification?.is_valid;

  return (
    <div className="rounded-xl border border-border bg-card p-6">
      <div className="flex items-start gap-3">
        <ShieldCheck
          className={`size-6 ${isVerified ? "text-primary" : "text-muted-foreground"}`}
        />
        <div className="flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-medium">Verifisert identitet</h2>
            {isVerified && verification && (
              <VerifiedBadge verifiedAt={verification.verified_at} />
            )}
          </div>
          {isLoading ? (
            <Loader2 className="mt-2 size-4 animate-spin text-muted-foreground" />
          ) : isVerified && verification ? (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Bekreftet som <strong>{verification.verified_name}</strong>. Gyldig til{" "}
                {new Date(verification.expires_at).toLocaleDateString("nb-NO", {
                  day: "numeric",
                  month: "long",
                  year: "numeric",
                })}
                . Visningsnavnet ditt er låst til dette navnet.
              </p>
              <div className="mt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => unverifyMutation.mutate()}
                  disabled={unverifyMutation.isPending}
                >
                  {unverifyMutation.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Avverifiser
                </Button>
              </div>
            </>
          ) : (
            <>
              <p className="mt-1 text-sm text-muted-foreground">
                Verifiser identiteten din med Vipps for å få en synlig
                «Verifisert»-pin på profilen og annonsene dine. Visningsnavnet
                blir låst til navnet ditt i Vipps. Gyldig i 12 måneder.
              </p>
              <div className="mt-4">
                <Button
                  size="sm"
                  onClick={() => startMutation.mutate()}
                  disabled={!enabled?.enabled || startMutation.isPending}
                >
                  {startMutation.isPending && (
                    <Loader2 className="size-4 animate-spin" />
                  )}
                  Verifiser med Vipps
                </Button>
                {!enabled?.enabled && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    Vipps-pålogging er ikke konfigurert ennå.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
