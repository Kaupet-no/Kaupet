import { useEffect, useMemo, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ImagePlus, Loader2, Lock, Plus, Trash2, User as UserIcon } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PanelSection, SaveState } from "@/features/business-account/business-profile-form";
import { hasEffectiveProffAccess } from "@/features/business-account/plans";
import type {
  BusinessLocation,
  BusinessOrganization,
} from "@/features/business-account/use-business-membership";
import { updateLocationContacts } from "@/lib/business.functions";
import { formatErrorMessage } from "@/lib/errors";
import { compressImage } from "@/lib/image-compression";
import { publicImageUrl } from "@/lib/image-url";
import { normalizePhone } from "@/lib/phone";
import {
  IMAGE_ACCEPT,
  deletePreviousOrganizationLogo,
  describeImageError,
  uploadOrganizationLogo,
  validateAvatarImage,
} from "@/lib/storage";

type ContactDraft = {
  key: string;
  id?: string;
  name: string;
  phone: string;
  showInListings: boolean;
  avatarPath: string | null;
  avatarFile: File | null;
};

function draftsFrom(location: BusinessLocation): ContactDraft[] {
  return location.contacts.map((contact) => ({
    key: contact.id,
    id: contact.id,
    name: contact.name,
    phone: contact.phone,
    showInListings: contact.show_in_listings,
    avatarPath: contact.avatar_path,
    avatarFile: null,
  }));
}

function ContactAvatar({ draft, name }: { draft: ContactDraft; name: string }) {
  const fileUrl = useMemo(
    () => (draft.avatarFile ? URL.createObjectURL(draft.avatarFile) : null),
    [draft.avatarFile],
  );
  useEffect(() => {
    if (fileUrl) return () => URL.revokeObjectURL(fileUrl);
  }, [fileUrl]);
  const src = fileUrl ?? (draft.avatarPath ? publicImageUrl(draft.avatarPath) : null);
  return src ? (
    <img src={src} alt={name} className="size-12 shrink-0 rounded-full object-cover" />
  ) : (
    <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-muted">
      <UserIcon className="size-5 text-muted-foreground" aria-hidden="true" />
    </span>
  );
}

function LocationContactsCard({
  organization,
  location,
  showLocationName,
}: {
  organization: BusinessOrganization;
  location: BusinessLocation;
  showLocationName: boolean;
}) {
  const queryClient = useQueryClient();
  const canUseAvatars = hasEffectiveProffAccess(organization);
  const [showVisitingAddress, setShowVisitingAddress] = useState(location.show_visiting_address);
  const [drafts, setDrafts] = useState(() => draftsFrom(location));
  const [errors, setErrors] = useState<Record<string, { name?: string; phone?: string }>>({});
  const callUpdate = useServerFn(updateLocationContacts);
  const address = [location.address_line, location.postal_code, location.city]
    .filter(Boolean)
    .join(", ");
  const idPrefix = `location-${location.id}`;

  const updateDraft = (key: string, patch: Partial<ContactDraft>) =>
    setDrafts((previous) =>
      previous.map((draft) => (draft.key === key ? { ...draft, ...patch } : draft)),
    );

  const mutation = useMutation({
    mutationFn: async () => {
      const nextErrors: typeof errors = {};
      for (const draft of drafts) {
        const error: { name?: string; phone?: string } = {};
        if (!draft.name.trim()) error.name = "Navn må fylles ut.";
        if (!normalizePhone(draft.phone)) error.phone = "Skriv et gyldig telefonnummer.";
        if (error.name || error.phone) nextErrors[draft.key] = error;
      }
      setErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        throw new Error("Rett opp feltene som er markert.");
      }

      const contacts = [];
      for (const draft of drafts) {
        let avatarPath = draft.avatarPath;
        if (canUseAvatars && draft.avatarFile) {
          const compressed = await compressImage(draft.avatarFile, "avatar");
          const imageError = validateAvatarImage(compressed);
          if (imageError) throw new Error(describeImageError(imageError));
          avatarPath = await uploadOrganizationLogo({
            organizationId: organization.id,
            file: compressed,
            kind: "contact",
          });
        }
        contacts.push({
          id: draft.id,
          name: draft.name.trim(),
          phone: draft.phone,
          showInListings: draft.showInListings,
          avatarPath,
        });
      }
      await callUpdate({ data: { locationId: location.id, showVisitingAddress, contacts } });

      if (canUseAvatars) {
        const keptPaths = new Set(contacts.map((contact) => contact.avatarPath));
        const stalePaths = location.contacts
          .map((contact) => contact.avatar_path)
          .filter((path): path is string => !!path && !keptPaths.has(path));
        await Promise.all(stalePaths.map((path) => deletePreviousOrganizationLogo(path)));
      }
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["business-membership"] });
    },
  });

  // Etter lagring kommer lokasjonen tilbake med ny updated_at, id-er for nye
  // kontakter og opplastede bildestier — synk utkastet da, men ikke ved en
  // vanlig refetch (fokus o.l.), som ellers ville slettet ulagrede endringer.
  const [syncedAt, setSyncedAt] = useState(location.updated_at);
  if (syncedAt !== location.updated_at) {
    setSyncedAt(location.updated_at);
    setDrafts(draftsFrom(location));
    setShowVisitingAddress(location.show_visiting_address);
  }

  return (
    <PanelSection
      title={showLocationName ? `Kontaktinformasjon – ${location.name}` : "Kontaktinformasjon"}
      description="Telefonnumre og besøksadresse som vises på annonser fra denne lokasjonen, slik at kjøpere kan ringe eller komme innom."
      footer={
        <>
          <Button type="button" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending && <Loader2 className="size-4 animate-spin" />}
            {mutation.isPending ? "Lagrer…" : "Lagre kontaktinformasjon"}
          </Button>
          <SaveState pending={mutation.isPending} saved={mutation.isSuccess} />
        </>
      }
    >
      {mutation.error && (
        <Alert variant="destructive">
          <AlertDescription>
            {formatErrorMessage(mutation.error, "Kunne ikke lagre kontaktinformasjonen.")}
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <p className="text-sm font-medium">Besøksadresse</p>
        <p className="text-sm text-muted-foreground">
          {address || "Lokasjonen har ingen registrert adresse."} Adressen endres under Administrer.
        </p>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={showVisitingAddress}
            disabled={!location.address_line}
            onCheckedChange={(value) => setShowVisitingAddress(value === true)}
            aria-describedby={`${idPrefix}-address-help`}
            className="mt-0.5"
          />
          <span>
            Vis besøksadressen i annonser
            <span id={`${idPrefix}-address-help`} className="block text-muted-foreground">
              Kartet i annonsen viser da den nøyaktige adressen i stedet for et omtrentlig område.
            </span>
          </span>
        </label>
      </div>

      <div className="space-y-4 border-t border-border pt-6">
        <p className="text-sm font-medium">Telefonnumre</p>
        {drafts.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Ingen telefonnumre lagt til. Legg til ett nummer per selger eller et felles nummer.
          </p>
        )}
        {drafts.map((draft, index) => {
          const fieldId = `${idPrefix}-contact-${index}`;
          const error = errors[draft.key] ?? {};
          const label = draft.name.trim() || `Telefonnummer ${index + 1}`;
          return (
            <fieldset key={draft.key} className="space-y-3 rounded-lg border border-border p-4">
              <legend className="sr-only">{label}</legend>
              <div className="flex flex-wrap items-start gap-4">
                {canUseAvatars && (
                  <div className="flex flex-col items-center gap-1.5">
                    <ContactAvatar draft={draft} name={`Profilbilde av ${label}`} />
                    <label
                      htmlFor={`${fieldId}-avatar`}
                      className="inline-flex min-h-8 cursor-pointer items-center gap-1 rounded-md px-2 text-xs font-medium text-primary hover:bg-muted"
                    >
                      <ImagePlus className="size-3.5" aria-hidden="true" />
                      {draft.avatarPath || draft.avatarFile ? "Bytt bilde" : "Legg til bilde"}
                    </label>
                    <input
                      id={`${fieldId}-avatar`}
                      type="file"
                      accept={IMAGE_ACCEPT}
                      className="sr-only"
                      aria-label={`Profilbilde for ${label}`}
                      onChange={(event) =>
                        updateDraft(draft.key, { avatarFile: event.target.files?.[0] ?? null })
                      }
                    />
                    {(draft.avatarPath || draft.avatarFile) && (
                      <button
                        type="button"
                        className="min-h-8 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted"
                        onClick={() =>
                          updateDraft(draft.key, { avatarPath: null, avatarFile: null })
                        }
                      >
                        Fjern bilde
                      </button>
                    )}
                  </div>
                )}
                <div className="grid min-w-0 flex-1 gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor={`${fieldId}-name`}>Navn</Label>
                    <Input
                      id={`${fieldId}-name`}
                      value={draft.name}
                      maxLength={120}
                      placeholder="f.eks. Kari Nordmann"
                      aria-invalid={Boolean(error.name)}
                      aria-describedby={error.name ? `${fieldId}-name-error` : undefined}
                      onChange={(event) => updateDraft(draft.key, { name: event.target.value })}
                    />
                    {error.name && (
                      <p id={`${fieldId}-name-error`} className="text-sm text-destructive">
                        {error.name}
                      </p>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`${fieldId}-phone`}>Telefonnummer</Label>
                    <Input
                      id={`${fieldId}-phone`}
                      type="tel"
                      inputMode="tel"
                      autoComplete="off"
                      value={draft.phone}
                      placeholder="123 45 678"
                      aria-invalid={Boolean(error.phone)}
                      aria-describedby={error.phone ? `${fieldId}-phone-error` : undefined}
                      onChange={(event) => updateDraft(draft.key, { phone: event.target.value })}
                    />
                    {error.phone && (
                      <p id={`${fieldId}-phone-error`} className="text-sm text-destructive">
                        {error.phone}
                      </p>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={draft.showInListings}
                    onCheckedChange={(value) =>
                      updateDraft(draft.key, { showInListings: value === true })
                    }
                  />
                  Vis nummeret i annonser
                </label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  aria-label={`Fjern ${label}`}
                  onClick={() =>
                    setDrafts((previous) => previous.filter((item) => item.key !== draft.key))
                  }
                >
                  <Trash2 className="size-4" aria-hidden="true" />
                  Fjern
                </Button>
              </div>
            </fieldset>
          );
        })}
        <Button
          type="button"
          variant="outline"
          disabled={drafts.length >= 20}
          onClick={() =>
            setDrafts((previous) => [
              ...previous,
              {
                key: crypto.randomUUID(),
                name: "",
                phone: "",
                showInListings: true,
                avatarPath: null,
                avatarFile: null,
              },
            ])
          }
        >
          <Plus className="size-4" aria-hidden="true" />
          Legg til telefonnummer
        </Button>
        {!canUseAvatars && (
          <div className="flex gap-3 rounded-lg border border-dashed border-border p-4">
            <Lock className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            <p className="text-sm leading-6 text-muted-foreground">
              Profilbilde av selgeren blir tilgjengelig med Proff.
            </p>
          </div>
        )}
      </div>
    </PanelSection>
  );
}

export function LocationContactsPanel({
  organization,
  locations,
}: {
  organization: BusinessOrganization;
  locations: BusinessLocation[];
}) {
  return (
    <div className="space-y-6">
      {locations.map((location) => (
        <LocationContactsCard
          key={location.id}
          organization={organization}
          location={location}
          showLocationName={locations.length > 1}
        />
      ))}
    </div>
  );
}
