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
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import type {
  BusinessLocation,
  BusinessOrganization,
} from "@/features/business-account/use-business-membership";
import {
  inviteOrganizationMember,
  removeOrganizationMember,
  setOrganizationLocationMember,
  type OrganizationMemberPermissions,
} from "@/lib/business.functions";
import { supabase } from "@/integrations/supabase/client";
import { formatErrorMessage } from "@/lib/errors";
type Category = { id: string; name_nb: string; parent_id: string | null };

export type OrganizationMember = OrganizationMemberPermissions & {
  user_id: string;
  status: "invited" | "active" | "deactivated";
  created_at: string;
  display_name: string | null;
  locationId: string;
};

type Props = {
  organization: BusinessOrganization;
  locations: BusinessLocation[];
  userId: string;
  role: "superuser" | "member";
};

const statusLabels: Record<OrganizationMember["status"], string> = {
  active: "Aktiv",
  invited: "Invitert",
  deactivated: "Deaktivert",
};

const defaultPermissions: OrganizationMemberPermissions = {
  role: "member",
  listingAccess: "own",
  chatAccess: "own",
  canCreateListings: true,
  listingEditScope: "own",
  categoryAccess: "all",
  allowedCategoryIds: [],
};

function permissionValue(member: OrganizationMember): OrganizationMemberPermissions {
  return {
    role: member.role,
    listingAccess: member.listingAccess,
    chatAccess: member.chatAccess,
    canCreateListings: member.canCreateListings,
    listingEditScope: member.listingEditScope,
    categoryAccess: member.categoryAccess,
    allowedCategoryIds: member.allowedCategoryIds,
  };
}

function normalizePermissions(value: OrganizationMemberPermissions): OrganizationMemberPermissions {
  if (value.role === "superuser") {
    return {
      ...value,
      listingAccess: "all",
      chatAccess: "all",
      canCreateListings: true,
      listingEditScope: "all",
      categoryAccess: "all",
      allowedCategoryIds: [],
    };
  }
  return {
    ...value,
    listingAccess: value.listingEditScope === "all" ? "all" : value.listingAccess,
    categoryAccess: value.canCreateListings ? value.categoryAccess : "all",
    allowedCategoryIds: value.categoryAccess === "restricted" ? value.allowedCategoryIds : [],
  };
}

function PermissionFields({
  value,
  categories,
  onChange,
  collapsible = false,
}: {
  value: OrganizationMemberPermissions;
  categories: Category[];
  onChange: (next: OrganizationMemberPermissions) => void;
  collapsible?: boolean;
}) {
  const update = (patch: Partial<OrganizationMemberPermissions>) =>
    onChange(normalizePermissions({ ...value, ...patch }));
  const disabled = value.role === "superuser";
  const [showAdvanced, setShowAdvanced] = useState(!collapsible);

  return (
    <div
      className={
        collapsible ? "border-t border-border pt-5" : "space-y-5 border-t border-border pt-5"
      }
    >
      {collapsible && (
        <button
          type="button"
          className="flex min-h-12 w-full items-center justify-between rounded-lg border border-border px-3 text-left text-sm font-medium transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-expanded={showAdvanced}
          onClick={() => setShowAdvanced((current) => !current)}
        >
          {showAdvanced ? "Skjul avanserte rettigheter" : "Vis avanserte rettigheter"}
        </button>
      )}
      {showAdvanced && (
        <div className="space-y-5">
          <p className="text-sm font-semibold">Rettigheter</p>
          <div className="space-y-2">
            <Label htmlFor="member-role">Rolle</Label>
            <select
              id="member-role"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.role}
              onChange={(event) =>
                update({ role: event.target.value as OrganizationMemberPermissions["role"] })
              }
            >
              <option value="member">Bruker</option>
              <option value="superuser">Superbruker</option>
            </select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Choice
              id="member-listing-access"
              label="Annonseinnsyn"
              value={value.listingAccess}
              disabled={disabled}
              options={[
                ["own", "Kun egne annonser"],
                ["all", "Alle bedriftens annonser"],
              ]}
              onChange={(listingAccess) =>
                update({
                  listingAccess: listingAccess as OrganizationMemberPermissions["listingAccess"],
                })
              }
            />
            <Choice
              id="member-chat-access"
              label="Chatinnsyn"
              value={value.chatAccess}
              disabled={disabled}
              options={[
                ["own", "Kun chatter om egne annonser"],
                ["all", "Alle bedriftens chatter"],
              ]}
              onChange={(chatAccess) =>
                update({ chatAccess: chatAccess as OrganizationMemberPermissions["chatAccess"] })
              }
            />
            <Choice
              id="member-edit-scope"
              label="Redigering"
              value={value.listingEditScope}
              disabled={disabled}
              options={[
                ["none", "Kan ikke redigere"],
                ["own", "Kan redigere egne"],
                ["all", "Kan redigere alle"],
              ]}
              onChange={(listingEditScope) =>
                update({
                  listingEditScope:
                    listingEditScope as OrganizationMemberPermissions["listingEditScope"],
                })
              }
            />
          </div>
          <label className="flex min-h-12 items-center gap-3 text-sm">
            <Checkbox
              checked={value.canCreateListings}
              disabled={disabled}
              onCheckedChange={(checked) => update({ canCreateListings: checked === true })}
            />
            <span>Kan opprette annonser</span>
          </label>
          <div className="space-y-3">
            <Label htmlFor="member-category-access">Kategorier for nye annonser</Label>
            <select
              id="member-category-access"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
              value={value.categoryAccess}
              disabled={disabled || !value.canCreateListings}
              onChange={(event) =>
                update({
                  categoryAccess: event.target
                    .value as OrganizationMemberPermissions["categoryAccess"],
                })
              }
            >
              <option value="all">Alle kategorier</option>
              <option value="restricted">Kun valgte kategorier</option>
            </select>
            {value.categoryAccess === "restricted" && value.canCreateListings && !disabled && (
              <div className="grid max-h-56 gap-2 overflow-y-auto rounded-md border border-border p-3 sm:grid-cols-2">
                {categories.map((category) => (
                  <label key={category.id} className="flex min-h-10 items-center gap-2 text-sm">
                    <Checkbox
                      checked={value.allowedCategoryIds.includes(category.id)}
                      onCheckedChange={(checked) =>
                        update({
                          allowedCategoryIds:
                            checked === true
                              ? [...value.allowedCategoryIds, category.id]
                              : value.allowedCategoryIds.filter((id) => id !== category.id),
                        })
                      }
                    />
                    <span>{category.name_nb}</span>
                  </label>
                ))}
              </div>
            )}
            {value.categoryAccess === "restricted" && value.allowedCategoryIds.length === 0 && (
              <p className="text-xs text-destructive">Velg minst én kategori.</p>
            )}
          </div>
          {disabled && (
            <p className="text-xs text-muted-foreground">
              Superbrukere har full tilgang til bedriftens annonser og chatter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function Choice({
  id,
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  options: string[][];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      >
        {options.map(([option, text]) => (
          <option key={option} value={option}>
            {text}
          </option>
        ))}
      </select>
    </div>
  );
}

export function MemberManagement({ organization, locations, userId, role }: Props) {
  const canManage = hasEffectiveProffAccess(organization) && role === "superuser";
  const queryClient = useQueryClient();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [permissions, setPermissions] = useState(defaultPermissions);
  const [editing, setEditing] = useState<OrganizationMember | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [removeTarget, setRemoveTarget] = useState<OrganizationMember | null>(null);
  const callInvite = useServerFn(inviteOrganizationMember);
  const callRemove = useServerFn(removeOrganizationMember);
  const callUpdate = useServerFn(setOrganizationLocationMember);

  const categoriesQuery = useQuery({
    queryKey: ["business-member-categories"],
    enabled: canManage,
    staleTime: 30_000,
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id, name_nb, parent_id")
        .order("name_nb");
      if (error) throw error;
      return data ?? [];
    },
  });
  const membersQuery = useQuery({
    queryKey: ["business-members", organization.id, locations.map((location) => location.id)],
    enabled: canManage,
    staleTime: 30_000,
    queryFn: async (): Promise<OrganizationMember[]> => {
      const { data: members, error } = await supabase
        .from("organization_members")
        .select("user_id, role, status, created_at, can_create_listings, category_access")
        .eq("organization_id", organization.id)
        .order("created_at", { ascending: true });
      if (error) throw error;
      const ids = (members ?? []).map((member) => member.user_id);
      const [
        { data: profiles, error: profilesError },
        { data: categoryRows, error: categoryError },
        { data: assignments, error: assignmentsError },
      ] = await Promise.all([
        ids.length
          ? supabase.from("profiles").select("id, display_name").in("id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? supabase
              .from("organization_member_categories")
              .select("user_id, category_id")
              .eq("organization_id", organization.id)
              .in("user_id", ids)
          : Promise.resolve({ data: [], error: null }),
        ids.length
          ? supabase
              .from("organization_location_members")
              .select("user_id, location_id, role, listing_access, listing_edit_scope, chat_access")
              .eq("organization_id", organization.id)
              .in("user_id", ids)
          : Promise.resolve({ data: [], error: null }),
      ]);
      if (profilesError || categoryError || assignmentsError) {
        throw profilesError ?? categoryError ?? assignmentsError;
      }
      const names = new Map((profiles ?? []).map((profile) => [profile.id, profile.display_name]));
      const allowed = new Map<string, string[]>();
      for (const row of categoryRows ?? [])
        allowed.set(row.user_id, [...(allowed.get(row.user_id) ?? []), row.category_id]);
      return (members ?? []).map((member) => {
        const assignment = (assignments ?? []).find((row) => row.user_id === member.user_id);
        return {
          user_id: member.user_id,
          role: member.role as OrganizationMember["role"],
          status: member.status as OrganizationMember["status"],
          created_at: member.created_at,
          display_name: names.get(member.user_id) ?? null,
          locationId: assignment?.location_id ?? locations[0]?.id ?? "",
          listingAccess: (assignment?.listing_access ??
            "own") as OrganizationMemberPermissions["listingAccess"],
          chatAccess: (assignment?.chat_access ??
            "own") as OrganizationMemberPermissions["chatAccess"],
          canCreateListings: member.can_create_listings,
          listingEditScope: (assignment?.listing_edit_scope ??
            "own") as OrganizationMemberPermissions["listingEditScope"],
          categoryAccess: member.category_access as OrganizationMemberPermissions["categoryAccess"],
          allowedCategoryIds: allowed.get(member.user_id) ?? [],
        };
      });
    },
  });
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["business-members", organization.id] });
  const inviteMutation = useMutation({
    mutationFn: () => {
      setErrorMessage(null);
      if (name.trim().length < 2) throw new Error("Navnet må være minst 2 tegn.");
      if (!/^\S+@\S+\.\S+$/u.test(email.trim()))
        throw new Error("Skriv inn en gyldig e-postadresse.");
      const next = normalizePermissions(permissions);
      if (next.categoryAccess === "restricted" && next.allowedCategoryIds.length === 0)
        throw new Error("Velg minst én kategori.");
      const defaultLocation = locations.find((location) => location.is_default) ?? locations[0];
      if (!defaultLocation) throw new Error("Bedriften må ha minst én aktiv lokasjon.");
      return callInvite({
        data: {
          name: name.trim(),
          email: email.trim(),
          permissions: next,
          locationAssignments: [
            {
              locationId: defaultLocation.id,
              role: next.role === "superuser" ? "manager" : "member",
              listingAccess: next.listingAccess,
              listingEditScope: next.listingEditScope,
              chatAccess: next.chatAccess,
            },
          ],
        },
      });
    },
    onSuccess: async () => {
      setName("");
      setEmail("");
      setPermissions(defaultPermissions);
      await invalidate();
    },
    onError: (error: Error) =>
      setErrorMessage(formatErrorMessage(error, "Kunne ikke invitere brukeren")),
  });
  const updateMutation = useMutation({
    mutationFn: () => {
      if (!editing) throw new Error("Velg en bruker.");
      const next = normalizePermissions(permissionValue(editing));
      if (next.categoryAccess === "restricted" && next.allowedCategoryIds.length === 0)
        throw new Error("Velg minst én kategori.");
      return callUpdate({
        data: {
          locationId: editing.locationId,
          userId: editing.user_id,
          role: editing.role === "superuser" ? "manager" : "member",
          listingAccess: next.listingAccess,
          listingEditScope: next.listingEditScope,
          chatAccess: next.chatAccess,
        },
      });
    },
    onSuccess: async () => {
      setEditing(null);
      await invalidate();
    },
    onError: (error: Error) =>
      setErrorMessage(formatErrorMessage(error, "Kunne ikke oppdatere tilgangene")),
  });
  const removeMutation = useMutation({
    mutationFn: (member: OrganizationMember) => callRemove({ data: { userId: member.user_id } }),
    onSuccess: async () => {
      setRemoveTarget(null);
      await invalidate();
    },
    onError: (error: Error) =>
      setErrorMessage(formatErrorMessage(error, "Kunne ikke fjerne medlemmet")),
  });

  if (!canManage) {
    return (
      <section aria-labelledby="business-members-title" className="space-y-4">
        <h2 id="business-members-title" className="font-display text-2xl tracking-tight">
          Brukere
        </h2>
        <Alert>
          <AlertDescription>
            Brukeradministrasjon er tilgjengelig for superbrukere med aktivt Proff-abonnement.
          </AlertDescription>
        </Alert>
      </section>
    );
  }

  const categories = categoriesQuery.data ?? [];
  return (
    <section aria-labelledby="business-members-title" className="space-y-6">
      <div>
        <h2 id="business-members-title" className="font-display text-3xl tracking-tight">
          Brukere
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">Inviter kollegaer og sett rettigheter.</p>
      </div>
      {errorMessage && (
        <Alert variant="destructive">
          <AlertDescription>{errorMessage}</AlertDescription>
        </Alert>
      )}
      <div className="space-y-4">
        <div>
          <h3 className="flex items-center gap-2 text-base font-semibold">
            <UserPlus className="size-5" /> Inviter bruker
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Rettighetene lagres sammen med invitasjonen.
          </p>
        </div>
        <form
          className="grid gap-4 border-t border-border pt-5 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!inviteMutation.isPending) inviteMutation.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="member-name">Navn</Label>
            <Input
              id="member-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="member-email">E-post</Label>
            <Input
              id="member-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <div className="sm:col-span-2">
            <PermissionFields
              value={permissions}
              categories={categories}
              onChange={setPermissions}
              collapsible
            />
          </div>
          <Button
            type="submit"
            className="sm:col-span-2 sm:w-fit"
            disabled={inviteMutation.isPending}
          >
            {inviteMutation.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <UserPlus className="size-4" />
            )}
            {inviteMutation.isPending ? "Sender…" : "Send invitasjon"}
          </Button>
        </form>
      </div>
      <div className="border-t border-border pt-6">
        <div>
          <h3 className="text-base font-semibold">Medlemmer</h3>
        </div>
        <div className="mt-4 overflow-hidden rounded-xl border border-border bg-card">
          {membersQuery.isLoading ? (
            <div role="status" aria-live="polite">
              <span className="sr-only">Laster medlemmer…</span>
              <ul className="divide-y divide-border" aria-hidden="true">
                {Array.from({ length: 3 }, (_, index) => (
                  <li key={index} className="flex items-center gap-3 px-6 py-4">
                    <Skeleton className="size-9 shrink-0 rounded-full" />
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/4" />
                    </div>
                    <Skeleton className="h-9 w-20 rounded-md" />
                  </li>
                ))}
              </ul>
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
                  <li key={member.user_id} className="flex flex-wrap items-center gap-3 px-6 py-4">
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
                        {member.role === "superuser" ? "Superbruker" : "Bruker"} ·{" "}
                        {statusLabels[member.status]}
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => setEditing(member)}
                    >
                      Rettigheter
                    </Button>
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
        </div>
      </div>
      <AlertDialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Endre rettigheter</AlertDialogTitle>
            <AlertDialogDescription>
              Endringene gjelder ved neste handling brukeren gjør.
            </AlertDialogDescription>
          </AlertDialogHeader>
          {editing && (
            <PermissionFields
              value={permissionValue(editing)}
              categories={categories}
              onChange={(next) => setEditing({ ...editing, ...next })}
            />
          )}
          <AlertDialogFooter>
            <AlertDialogCancel>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault();
                if (!updateMutation.isPending) updateMutation.mutate();
              }}
            >
              {updateMutation.isPending ? "Lagrer…" : "Lagre rettigheter"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={!!removeTarget} onOpenChange={(open) => !open && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Fjerne medlemmet?</AlertDialogTitle>
            <AlertDialogDescription>
              Medlemmet mister organisasjonstilgangen. Annonsene overføres til en superbruker.
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
