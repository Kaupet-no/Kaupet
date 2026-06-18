import { useEffect, useRef, useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { toast } from "sonner";
import {
  Bell,
  Calendar,
  Camera,
  ListChecks,
  Loader2,
  LogOut,
  ShoppingBag,
  Star,
  Trash2,
  ShieldOff,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { StarRating } from "@/components/star-rating";
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
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/push.functions";
import { listMyBlocks, deleteBlock } from "@/lib/blocks.functions";
import { getMyProfileStats } from "@/lib/reviews.functions";
import { formatErrorMessage } from "@/lib/errors";
import { describeImageError, uploadAvatarImage, validateAvatarImage } from "@/lib/storage";

const profileSchema = z.object({
  display_name: z.string().trim().min(2, "Minst 2 tegn").max(80),
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
  validateSearch: (
    search: Record<string, unknown>,
  ): { tab?: "profil" | "konto" | "varslinger" | "blokkerte" } => {
    const t = search.tab;
    if (t === "konto" || t === "varslinger" || t === "blokkerte" || t === "profil") {
      return { tab: t };
    }
    return {};
  },
  component: ProfilePage,
});

function ProfilePage() {
  const { tab = "profil" } = Route.useSearch();
  const navigate = Route.useNavigate();

  return (
    <div className="mx-auto max-w-2xl px-4 py-10">
      <h1 className="font-display text-3xl tracking-tight">Min profil</h1>

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
        className="mt-6"
      >
        <TabsList>
          <TabsTrigger value="profil">Profilinfo</TabsTrigger>
          <TabsTrigger value="varslinger">Varslinger</TabsTrigger>
          <TabsTrigger value="blokkerte">Blokkerte</TabsTrigger>
          <TabsTrigger value="konto">Konto</TabsTrigger>
        </TabsList>
        <TabsContent value="profil" className="mt-6">
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
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
        .select("display_name, avatar_url")
        .eq("id", userId!)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const getStats = useServerFn(getMyProfileStats);
  const { data: stats } = useQuery({
    queryKey: ["my-profile-stats"],
    queryFn: () => getStats({}),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ProfileForm>({
    defaultValues: { display_name: "" },
  });

  useEffect(() => {
    if (profile) {
      reset({ display_name: profile.display_name ?? "" });
    }
  }, [profile, reset]);

  const mutation = useMutation({
    mutationFn: async (values: ProfileForm) => {
      if (!userId) throw new Error("Ikke innlogget");
      const parsed = profileSchema.parse(values);
      const { error } = await supabase
        .from("profiles")
        .update({ display_name: parsed.display_name })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-edit", userId] });
      queryClient.invalidateQueries({ queryKey: ["profile-menu", userId] });
      toast.success("Profil oppdatert");
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke oppdatere profilen")),
  });

  const avatarMutation = useMutation({
    mutationFn: async (file: File) => {
      if (!userId) throw new Error("Ikke innlogget");
      const avatarUrl = await uploadAvatarImage({ userId, file });
      const { error } = await supabase
        .from("profiles")
        .update({ avatar_url: avatarUrl })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["profile-edit", userId] });
      queryClient.invalidateQueries({ queryKey: ["profile-menu", userId] });
      toast.success("Profilbilde oppdatert");
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke laste opp profilbildet")),
    onSettled: () => setUploadingAvatar(false),
  });

  function handleAvatarFile(file: File) {
    const err = validateAvatarImage(file);
    if (err) {
      toast.error(describeImageError(err));
      return;
    }
    setUploadingAvatar(true);
    avatarMutation.mutate(file);
  }

  const displayName = profile?.display_name ?? "";
  const memberSince = stats
    ? new Date(stats.created_at).toLocaleDateString("nb-NO", { month: "long", year: "numeric" })
    : null;

  if (isLoading) return <Loader2 className="size-5 animate-spin text-muted-foreground" />;

  return (
    <div className="space-y-8">
      <Card>
        <CardHeader>
          <CardTitle>Profilinfo</CardTitle>
        </CardHeader>
        <form onSubmit={handleSubmit((v) => mutation.mutate(v))}>
          <CardContent className="flex items-center gap-5">
            <div className="flex shrink-0 flex-col items-center gap-2">
              <div className="relative">
                <Avatar className="size-20">
                  {profile?.avatar_url && (
                    <AvatarImage src={profile.avatar_url} alt={displayName} />
                  )}
                  <AvatarFallback className="bg-primary/10 text-lg font-medium text-primary">
                    {displayName?.slice(0, 2).toUpperCase() || "?"}
                  </AvatarFallback>
                </Avatar>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) handleAvatarFile(file);
                    e.target.value = "";
                  }}
                />
                <button
                  type="button"
                  aria-label="Last opp profilbilde"
                  disabled={uploadingAvatar}
                  onClick={() => fileInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 flex size-7 items-center justify-center rounded-full border-2 border-card bg-primary text-primary-foreground shadow-sm transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  {uploadingAvatar ? (
                    <Loader2 className="size-3.5 animate-spin" />
                  ) : (
                    <Camera className="size-3.5" />
                  )}
                </button>
              </div>
              {memberSince && (
                <p className="flex items-center gap-1 text-xs text-muted-foreground">
                  <Calendar className="size-3" /> Siden {memberSince}
                </p>
              )}
            </div>
            <div className="max-w-xs flex-1 space-y-2">
              <Label htmlFor="display_name">Visningsnavn</Label>
              <Input id="display_name" {...register("display_name")} />
              {errors.display_name && (
                <p className="text-sm text-destructive">{errors.display_name.message}</p>
              )}
            </div>
          </CardContent>
          <CardFooter className="justify-end border-t pt-6">
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
              Lagre profil
            </Button>
          </CardFooter>
        </form>
      </Card>

      <ProfileStats />
    </div>
  );
}

function StatCell({
  label,
  value,
  icon,
  children,
}: {
  label: string;
  value?: string;
  icon: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 px-4 py-5 text-center">
      <span className="flex items-center gap-1 text-xs text-muted-foreground">
        {icon} {label}
      </span>
      <div className="flex min-h-7 items-center justify-center">
        {value !== undefined ? (
          <span className="text-xl font-semibold tabular-nums">{value}</span>
        ) : (
          children
        )}
      </div>
    </div>
  );
}

function ProfileStats() {
  const getStats = useServerFn(getMyProfileStats);
  const { data: stats, isLoading } = useQuery({
    queryKey: ["my-profile-stats"],
    queryFn: () => getStats({}),
  });

  if (isLoading || !stats) {
    return (
      <Card>
        <CardContent className="grid grid-cols-3 divide-x divide-border p-0">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center justify-center py-8">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ))}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="grid grid-cols-3 divide-x divide-border p-0">
        <StatCell label="Annonser" icon={<ListChecks className="size-3.5" />}>
          {stats.listings_count > 0 ? (
            <span className="text-xl font-semibold tabular-nums">
              {stats.listings_count.toLocaleString("nb-NO")}
            </span>
          ) : (
            <Link
              to="/ny-annonse"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              Opprett din første
            </Link>
          )}
        </StatCell>
        <StatCell label="Salg" icon={<ShoppingBag className="size-3.5" />}>
          {stats.sales_count > 0 ? (
            <span className="text-xl font-semibold tabular-nums">
              {stats.sales_count.toLocaleString("nb-NO")}
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen ennå</span>
          )}
        </StatCell>
        <StatCell label="Vurdering" icon={<Star className="size-3.5" />}>
          {stats.review_count > 0 ? (
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-semibold tabular-nums">
                {stats.avg_rating.toFixed(1)}
              </span>
              <StarRating value={stats.avg_rating} readOnly size={14} />
            </div>
          ) : (
            <span className="text-xs text-muted-foreground">Ingen ennå</span>
          )}
        </StatCell>
      </CardContent>
    </Card>
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
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke endre e-postadressen")),
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
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke endre passordet")),
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
        <p className="mt-1 text-sm text-muted-foreground">Avslutt økten på denne enheten.</p>
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
    !!currentEmail && confirmation.trim().toLowerCase() === currentEmail.trim().toLowerCase();

  async function handleDelete() {
    if (!canConfirm) return;
    setSubmitting(true);
    const { error } = await supabase.rpc("request_account_deletion", {
      _email: confirmation.trim(),
    });
    if (error) {
      setSubmitting(false);
      toast.error(formatErrorMessage(error, "Kunne ikke laste opp profilbildet"));
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
        Sletter kontoen din og dine personopplysninger. Annonsene dine fjernes helt. Tidligere
        meldinger du har sendt vil fortsatt være synlige for mottakerne, men avsendernavnet endres
        til «Slettet bruker». Av sikkerhetshensyn settes kontoen først inaktiv i 7 dager. Logger du
        inn igjen innen denne perioden, avbrytes slettingen automatisk. Etter 7 dager slettes
        kontoen permanent og kan ikke gjenopprettes.
      </p>
      <div className="mt-4 flex justify-end">
        <AlertDialog
          open={open}
          onOpenChange={(v) => {
            setOpen(v);
            if (!v) setConfirmation("");
          }}
        >
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
                    Kontoen din blir satt inaktiv umiddelbart, og du logges ut. Alle dine annonser
                    arkiveres og blir ikke lenger synlige for andre.
                  </p>
                  <p>
                    Innen <strong>7 dager</strong> kan du gjenopprette kontoen ved å logge inn på
                    nytt. Etter 7 dager slettes profilen din permanent — annonsene dine fjernes, men
                    meldinger du har sendt blir værende hos mottakerne med avsendernavnet{" "}
                    <em>«Slettet bruker»</em>.
                  </p>
                  <p>
                    Skriv inn e-postadressen din (<strong>{currentEmail}</strong>) for å bekrefte:
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
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(() =>
    getPermissionState(),
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
      web_push_price_drops: boolean;
    }) => {
      await updatePrefs({ data: values });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notification-preferences"] });
      toast.success("Innstillingene er lagret");
    },
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke lagre innstillingene")),
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
      toast.error(formatErrorMessage(e, "Klarte ikke å aktivere varsler"));
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
      toast.error(formatErrorMessage(e, "Klarte ikke å deaktivere varsler"));
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
              Få varsler om nye meldinger og treff i lagrede søk selv når Kaupet.no ikke er åpen. På
              iPhone må du først legge til Kaupet.no på hjem-skjermen.
            </p>

            {!supported ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Push-varsler er ikke tilgjengelig i denne nettleseren eller i en innebygd
                forhåndsvisning. Åpne <strong>kaupet.no</strong> direkte for å aktivere.
              </p>
            ) : permission === "denied" ? (
              <p className="mt-4 text-sm text-destructive">
                Du har blokkert varsler for kaupet.no. Endre tillatelsen i nettleserinnstillingene
                for å aktivere på nytt.
              </p>
            ) : (
              <div className="mt-4 flex flex-wrap gap-2">
                {endpoint ? (
                  <Button variant="outline" onClick={handleUnsubscribe} disabled={busy !== null}>
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
                    web_push_price_drops: prefs.web_push_price_drops,
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
                    web_push_price_drops: prefs.web_push_price_drops,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pref-price-drops" className="text-sm font-medium">
                  Prisfall på favoritter
                </Label>
                <p className="text-sm text-muted-foreground">
                  Varsel når en favoritt-annonse blir satt ned med mer enn 5 %.
                </p>
              </div>
              <Switch
                id="pref-price-drops"
                checked={prefs.web_push_price_drops}
                disabled={mutation.isPending}
                onCheckedChange={(v) =>
                  mutation.mutate({
                    web_push_messages: prefs.web_push_messages,
                    web_push_saved_searches: prefs.web_push_saved_searches,
                    web_push_price_drops: v,
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
    onError: (e: Error) => toast.error(formatErrorMessage(e, "Kunne ikke oppheve blokkeringen")),
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
        Brukere og samtaler du har blokkert. Opphev blokkeringen for å kunne sende og motta
        meldinger igjen.
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
                {(b.blocked_profile?.display_name ?? "?").slice(0, 2).toUpperCase()}
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
