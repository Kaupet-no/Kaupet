import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ChevronRight,
  Heart,
  ListChecks,
  LogOut,
  Search,
  Settings,
  Shield,
  User,
} from "lucide-react";
import { useQueryClient, useQuery } from "@tanstack/react-query";

import { useAuth } from "@/lib/use-auth";
import { useIsAdmin } from "@/lib/use-is-admin";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { NativePageHeader } from "@/components/native-page-header";

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
              label="Innstillinger"
              last
              onClick={() => void navigate({ to: "/profil", search: { tab: "konto" } })}
            />
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
              onClick={() => void handleLogout()}
            />
          </div>
        </div>
      </div>
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
