import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  FlaskConical,
  Heart,
  ListChecks,
  LogOut,
  MessageSquareHeart,
  Moon,
  Search,
  Settings,
  Shield,
  ShieldCheck,
  User,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsDemo } from "@/hooks/use-is-demo";
import { useTheme } from "@/hooks/use-theme";
import { useIsTestEnv } from "@/lib/env";
import { setTestMode } from "@/lib/test-mode.functions";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { NativePageHeader } from "@/components/native-page-header";
import { FeedbackPanel } from "@/components/feedback-tag";
import { NativeSheet } from "@/components/ui/native-sheet";
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
import { Link } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/meg")({
  head: () => ({ meta: [{ title: "Meg — Kaupet.no" }] }),
  component: MegPage,
});

function initials(name: string | null | undefined, fallback: string) {
  const source = (name ?? fallback).trim();
  if (!source) return "?";
  const parts = source.split(/\s+/u).slice(0, 2);
  return parts.map((p) => p[0]?.toUpperCase() ?? "").join("") || "?";
}

function MegPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: isAdmin } = useIsAdmin();
  const { data: isDemo } = useIsDemo();
  const canToggleTest = !!(isAdmin || isDemo);
  const isTest = useIsTestEnv();
  const [toggling, setToggling] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const { resolvedTheme, setTheme } = useTheme();
  const callSetTestMode = useServerFn(setTestMode);

  async function handleToggleTest(next: boolean) {
    if (toggling) return;
    setToggling(true);
    try {
      await callSetTestMode({ data: { enabled: next } });
      showSuccessToast(next ? "Test-modus aktivert" : "Test-modus deaktivert");
      window.location.reload();
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Kunne ikke endre test-modus");
      setToggling(false);
    }
  }

  const { data: profile } = useQuery({
    queryKey: ["profile-menu", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, avatar_url")
        .eq("id", user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const displayName = profile?.display_name ?? user?.email?.split("@")[0] ?? "Bruker";

  const handleLogout = async () => {
    await supabase.auth.signOut();
    qc.clear();
    void navigate({ to: "/" });
  };

  return (
    <>
      <NativePageHeader title="Meg" hideBack />
      <div className="mx-auto max-w-lg px-4 py-6">
        {/* Profilhode */}
        <button
          type="button"
          onClick={() => void navigate({ to: "/profil" })}
          className="flex w-full items-center gap-4 rounded-2xl border border-border bg-card px-5 py-5 text-left transition active:bg-muted"
        >
          <Avatar className="size-16 shrink-0">
            {profile?.avatar_url && <AvatarImage src={profile.avatar_url} alt={displayName} />}
            <AvatarFallback className="bg-primary/10 text-xl font-semibold text-primary">
              {initials(profile?.display_name, user?.email ?? "")}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-lg font-semibold">{displayName}</p>
            {user?.email && <p className="truncate text-sm text-muted-foreground">{user.email}</p>}
          </div>
        </button>

        {/* Mine ting */}
        <div className="mt-6">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Mine ting
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <NavRow
              icon={<ListChecks className="size-5 text-primary" />}
              label="Mine annonser"
              onClick={() => void navigate({ to: "/mine-annonser" })}
            />
            <NavRow
              icon={<Heart className="size-5 text-primary" />}
              label="Favoritter"
              onClick={() => void navigate({ to: "/favoritter" })}
            />
            <NavRow
              icon={<Search className="size-5 text-primary" />}
              label="Mine søk"
              last
              onClick={() => void navigate({ to: "/mine-sok" })}
            />
          </div>
        </div>

        {/* Konto */}
        <div className="mt-6">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Konto
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <NavRow
              icon={<User className="size-5 text-primary" />}
              label="Min profil"
              onClick={() => void navigate({ to: "/profil" })}
            />
            {isAdmin && (
              <NavRow
                icon={<Shield className="size-5 text-primary" />}
                label="Administrasjon"
                onClick={() => void navigate({ to: "/admin" })}
              />
            )}
            <NavRow
              icon={<Settings className="size-5 text-primary" />}
              label="Kontoinnstillinger"
              onClick={() => void navigate({ to: "/profil", search: { tab: "konto" } })}
            />
            <div
              className={`flex items-center justify-between gap-3 px-4 py-3.5 ${
                canToggleTest ? "border-b border-border" : ""
              }`}
              onClick={(e) => e.stopPropagation()}
            >
              <span className="flex items-center gap-3 text-sm font-medium">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                  <Moon className="size-5 text-primary" />
                </span>
                Mørk modus
              </span>
              <Switch
                id="dark-mode-toggle-meg"
                checked={resolvedTheme === "dark"}
                onCheckedChange={(checked) => setTheme(checked ? "dark" : "light")}
                aria-label="Aktiver mørk modus"
              />
            </div>
            {canToggleTest && (
              <div
                className="flex items-center justify-between gap-3 px-4 py-3.5"
                onClick={(e) => e.stopPropagation()}
              >
                <span className="flex items-center gap-3 text-sm font-medium">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
                    <FlaskConical className="size-5 text-primary" />
                  </span>
                  Test-modus
                </span>
                <Switch
                  id="test-mode-toggle-meg"
                  checked={isTest}
                  disabled={toggling}
                  onCheckedChange={handleToggleTest}
                  aria-label="Aktiver test-modus for denne sesjonen"
                />
              </div>
            )}
          </div>
        </div>

        {/* Ris og Ros — native-motstykket til web-ens FeedbackTag */}
        <div className="mt-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <NavRow
              icon={<MessageSquareHeart className="size-5 text-primary" />}
              label="Ris og Ros"
              last
              onClick={() => setFeedbackOpen(true)}
            />
          </div>
        </div>
        <NativeSheet
          open={feedbackOpen}
          onOpenChange={setFeedbackOpen}
          title="Ris og Ros"
          titleVisible
          className="pb-safe"
        >
          <div className="px-4">
            <FeedbackPanel onDone={() => setFeedbackOpen(false)} />
          </div>
        </NativeSheet>

        {/* Om Kaupet.no — samme personvern-/åpen kildekode-budskap som vises
            i footer på web, som native-brukere ellers aldri ser. */}
        <div className="mt-6">
          <p className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Om Kaupet.no
          </p>
          <div className="overflow-hidden rounded-2xl border border-border bg-card p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                Som bruker av Kaupet.no er du med på å bygge en litt andreledes markedsplass, uten
                sporingscookies eller eksterne analyseverktøy. Les vår{" "}
                <Link to="/personvern" className="underline hover:text-foreground">
                  personvernerklæring her
                </Link>
                .
              </p>
            </div>
          </div>
        </div>

        {/* Logg ut */}
        <div className="mt-6">
          <div className="overflow-hidden rounded-2xl border border-border bg-card">
            <NavRow
              icon={<LogOut className="size-5 text-destructive" />}
              label="Logg ut"
              destructive
              last
              onClick={() => setLogoutConfirmOpen(true)}
            />
          </div>
        </div>
      </div>

      <AlertDialog open={logoutConfirmOpen} onOpenChange={setLogoutConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Logg ut?</AlertDialogTitle>
            <AlertDialogDescription>
              Du blir logget ut av Kaupet.no på denne enheten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void handleLogout();
              }}
            >
              Logg ut
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function NavRow({
  icon,
  label,
  onClick,
  destructive,
  last,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  destructive?: boolean;
  last?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition active:bg-muted ${
        !last ? "border-b border-border" : ""
      }`}
    >
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted/60">
        {icon}
      </span>
      <span
        className={`flex-1 text-sm font-medium ${destructive ? "text-destructive" : "text-foreground"}`}
      >
        {label}
      </span>
      {!destructive && <ChevronRight className="size-4 shrink-0 text-muted-foreground/50" />}
    </button>
  );
}
