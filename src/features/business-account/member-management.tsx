import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, UserPlus, UserRound, UserX } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import type { BusinessOrganization } from "@/features/business-account/use-business-membership";
import { inviteOrganizationMember, removeOrganizationMember } from "@/lib/business.functions";
import { supabase } from "@/integrations/supabase/client";

export type OrganizationMember = {
  user_id: string;
  role: "superuser" | "member";
  status: "invited" | "active" | "deactivated";
  created_at: string;
  display_name: string | null;
};

type Props = { organization: BusinessOrganization; userId: string };

const statusLabels: Record<OrganizationMember["status"], string> = {
  active: "Aktiv",
  invited: "Invitert",
  deactivated: "Deaktivert",
};

export function MemberManagement({ organization, userId }: Props) {
  const canManage = hasEffectiveProffAccess(organization);
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(null);
  const callInvite = useServerFn(inviteOrganizationMember);
  const callRemove = useServerFn(removeOrganizationMember);

  const membersQuery = useQuery({
    queryKey: ["business-members", organization.id],
    enabled: canManage,
    queryFn: async (): Promise<OrganizationMember[]> => {
      const { data: members, error: membersError } = await supabase
        .from("organization_members")
        .select("user_id, role, status, created_at")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: true });
      if (membersError) throw membersError;
      const ids = (members ?? []).map((member) => member.user_id);
      const { data: profiles, error: profilesError } = ids.length
        ? await supabase.from("profiles").select("id, display_name").in("id", ids)
        : { data: [], error: null };
      if (profilesError) throw profilesError;
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
      return (members ?? []).map((member) => ({
        user_id: member.user_id,
        role: member.role as OrganizationMember["role"],
        status: member.status as OrganizationMember["status"],
        created_at: member.created_at,
        display_name: names.get(member.user_id) ?? null,
      }));
    },
  });

  const inviteMutation = useMutation({
    mutationFn: () => {
      setErrorMessage(null);
      const trimmedName = name.trim();
      const trimmedEmail = email.trim();
      if (trimmedName.length < 2) throw new Error("Navnet må være minst 2 tegn.");
      if (!/^\S+@\S+\.\S+$/u.test(trimmedEmail))
        throw new Error("Skriv inn en gyldig e-postadresse.");
      return callInvite({ data: { name: trimmedName, email: trimmedEmail } });
    },
    onSuccess: async () => {
      setName("");
      setEmail("");
      await queryClient.invalidateQueries({ queryKey: ["business-members", organization.id] });
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  const removeMutation = useMutation({
    mutationFn: (member: OrganizationMember) => callRemove({ data: { userId: member.user_id } }),
    onSuccess: async () => {
      setRemoveTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["business-members", organization.id] });
    },
    onError: (error: Error) => setErrorMessage(error.message),
  });

  if (!canManage) {
    return (
      <section aria-labelledby="business-members-title" className="space-y-4">
        <h2 id="business-members-title" className="font-display text-2xl tracking-tight">
          Brukere
        </h2>
        <Alert>
          <AlertDescription>
            Brukeradministrasjon er tilgjengelig med aktiv Proff. Inviterte brukere og lagrede
            medlemsopplysninger beholdes når tilgangen utløper.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  return (
    <section aria-labelledby="business-members-title" className="space-y-6">
      <div>
        <h2 id="business-members-title" className="font-display text-2xl tracking-tight">
          Brukere
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Inviter kollegaer som kan opprette og administrere egne bedriftsannonser.
        </p>
      </div>

      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <UserPlus className="size-5" /> Inviter bruker
          </CardTitle>
          <CardDescription>
            Invitasjonen sendes fra Kaupet til den nye brukerens e-post.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="grid gap-4 sm:grid-cols-[1fr_1fr_auto] sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              if (!inviteMutation.isPending) inviteMutation.mutate();
            }}
          >
            <div className="space-y-2">
              <Label htmlFor="member-name">Navn</Label>
              <div className="relative">
                <Input
                  id="member-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  className="leading-6"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="member-email">E-post</Label>
              <div className="relative">
                <Input
                  id="member-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="leading-6"
                />
              </div>
            </div>
            <Button type="submit" disabled={inviteMutation.isPending}>
              {inviteMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {inviteMutation.isPending ? "Sender…" : "Send invitasjon"}
            </Button>
          </form>
          <p className="mt-3 text-xs text-muted-foreground" role="status" aria-live="polite">
            {inviteMutation.isPending
              ? "Sender invitasjon…"
              : inviteMutation.isSuccess
                ? "Invitasjonen er sendt."
                : ""}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Medlemmer</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {membersQuery.isLoading ? (
            <div
              className="flex items-center gap-2 px-6 pb-6 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="size-4 animate-spin" /> Laster medlemmer…
            </div>
          ) : membersQuery.isError ? (
            <Alert variant="destructive" className="m-6">
              <AlertDescription>Kunne ikke laste medlemmer. Prøv igjen senere.</AlertDescription>
            </Alert>
          ) : membersQuery.data?.length ? (
            <ul className="divide-y divide-border">
              {membersQuery.data.map((member) => {
                const isSelf = member.user_id === userId;
                return (
                  <li key={member.user_id} className="flex items-center gap-3 px-6 py-4">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-muted">
                      <UserRound className="size-4 text-muted-foreground" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {member.display_name ?? "Invitert bruker"}
                        {isSelf && (
                          <span className="ml-2 text-xs font-normal text-muted-foreground">
                            (deg)
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {member.role === "superuser" ? "Superbruker" : "Medlem"} ·{" "}
                        {statusLabels[member.status]}
                      </p>
                    </div>
                    {member.role === "member" && member.status !== "deactivated" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="text-destructive hover:text-destructive"
                        onClick={() => setRemoveTarget(member)}
                        disabled={removeMutation.isPending}
                      >
                        <UserX className="size-4" /> Fjern
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="px-6 pb-6 text-sm text-muted-foreground">Ingen medlemmer å vise.</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjerne medlemmet?</AlertDialogTitle>
            <AlertDialogDescription>
              Medlemmet mister organisasjonstilgangen, men beholder sin private Kaupet-konto.
              Annonsene overføres til superbrukeren.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (removeTarget) removeMutation.mutate(removeTarget);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removeMutation.isPending ? "Fjerner…" : "Fjern medlem"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
