import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Check, Copy, KeyRound, Loader2, Plus } from "lucide-react";

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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ResponsiveOverlay, ResponsiveOverlayContent } from "@/components/ui/responsive-overlay";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { PanelSection } from "@/features/business-account/business-profile-form";
import { ImportHistory } from "@/features/listing-bulk-import/ImportHistory";
import type { BusinessLocation } from "@/features/business-account/use-business-membership";
import {
  createApiKey,
  getIntegrationUsage,
  listApiKeys,
  revokeApiKey,
  type ApiKeySummary,
} from "@/features/business-account/api-keys.functions";
import { formatErrorMessage } from "@/lib/errors";
import {
  formatLimit,
  INTEGRATION_LIMIT_LABELS_NB,
  INTEGRATION_LIMITS,
} from "@/lib/integration-limits";
import { showErrorToast, showSuccessToast } from "@/lib/toast";

const SCOPE_LABELS_NB: Record<string, string> = {
  "listings:read": "Lese annonser",
  "listings:write": "Opprette/oppdatere annonser",
};

const EXPIRING_SOON_DAYS = 14;

function isExpiringSoon(expiresAt: string): boolean {
  const daysLeft = (new Date(expiresAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
  return daysLeft > 0 && daysLeft <= EXPIRING_SOON_DAYS;
}

function isActive(key: ApiKeySummary): boolean {
  return !key.revokedAt && new Date(key.expiresAt).getTime() > Date.now();
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("nb-NO") : "Aldri";
}

function CreateApiKeyOverlay({
  open,
  onOpenChange,
  locations,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  locations: BusinessLocation[];
  onCreated: (plaintext: string) => void;
}) {
  const [name, setName] = useState("");
  const [locationId, setLocationId] = useState(
    locations.find((location) => location.is_default)?.id ?? locations[0]?.id ?? "",
  );
  const [scopes, setScopes] = useState<string[]>(["listings:read"]);
  const [lifetimeDays, setLifetimeDays] = useState(INTEGRATION_LIMITS.apiKey.defaultLifetimeDays);
  const callCreate = useServerFn(createApiKey);

  const mutation = useMutation({
    mutationFn: () =>
      callCreate({
        data: { name: name.trim(), defaultLocationId: locationId, scopes, lifetimeDays },
      }),
    onSuccess: (result) => {
      onCreated(result.plaintext);
      setName("");
      setScopes(["listings:read"]);
    },
  });

  const toggleScope = (scope: string, checked: boolean) => {
    setScopes((previous) =>
      checked ? [...previous, scope] : previous.filter((value) => value !== scope),
    );
  };

  return (
    <ResponsiveOverlay
      open={open}
      onOpenChange={(next) => {
        if (mutation.isPending) return;
        if (!next) mutation.reset();
        onOpenChange(next);
      }}
    >
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Opprett API-nøkkel</DialogTitle>
          <DialogDescription>
            Nøkkelen brukes til å synke annonser fra deres eget system via Kaupets API.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (!mutation.isPending && name.trim() && locationId && scopes.length > 0) {
              mutation.mutate();
            }
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="api-key-name">Navn</Label>
            <Input
              id="api-key-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="F.eks. Lagersystem"
              maxLength={60}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="api-key-location">Lokasjon</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="api-key-location">
                <SelectValue placeholder="Velg lokasjon" />
              </SelectTrigger>
              <SelectContent>
                {locations.map((location) => (
                  <SelectItem key={location.id} value={location.id}>
                    {location.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Tilganger</legend>
            {(["listings:read", "listings:write"] as const).map((scope) => (
              <label key={scope} className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={scopes.includes(scope)}
                  onCheckedChange={(checked) => toggleScope(scope, checked === true)}
                />
                {SCOPE_LABELS_NB[scope]}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-sm font-medium">Varighet</legend>
            <RadioGroup
              value={String(lifetimeDays)}
              onValueChange={(value) => setLifetimeDays(Number(value))}
              className="flex flex-wrap gap-4"
            >
              {INTEGRATION_LIMITS.apiKey.lifetimeOptionsDays.map((days) => (
                <div key={days} className="flex items-center gap-2">
                  <RadioGroupItem value={String(days)} id={`api-key-lifetime-${days}`} />
                  <Label htmlFor={`api-key-lifetime-${days}`} className="font-normal">
                    {days} dager
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </fieldset>
          {mutation.error && (
            <Alert variant="destructive" role="alert">
              <AlertDescription>
                {formatErrorMessage(mutation.error, "Kunne ikke opprette nøkkelen. Prøv igjen.")}
              </AlertDescription>
            </Alert>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={mutation.isPending}
              onClick={() => onOpenChange(false)}
            >
              Avbryt
            </Button>
            <Button
              type="submit"
              disabled={mutation.isPending || !name.trim() || !locationId || scopes.length === 0}
              aria-busy={mutation.isPending}
            >
              {mutation.isPending && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
              {mutation.isPending ? "Oppretter…" : "Opprett nøkkel"}
            </Button>
          </DialogFooter>
        </form>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function RevealKeyOverlay({
  plaintext,
  onClose,
}: {
  plaintext: string | null;
  onClose: () => void;
}) {
  const [copied, setCopied] = useState(false);

  return (
    <ResponsiveOverlay open={!!plaintext} onOpenChange={(next) => !next && onClose()}>
      <ResponsiveOverlayContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nøkkelen er opprettet</DialogTitle>
          <DialogDescription>
            Kopier nøkkelen nå — den vises ikke igjen. Dere må opprette en ny nøkkel hvis den
            forsvinner.
          </DialogDescription>
        </DialogHeader>
        <div className="flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3">
          <code className="min-w-0 flex-1 break-all text-sm">{plaintext}</code>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={async () => {
              if (!plaintext) return;
              try {
                await navigator.clipboard.writeText(plaintext);
                setCopied(true);
                showSuccessToast("Nøkkel kopiert");
                setTimeout(() => setCopied(false), 1500);
              } catch {
                showErrorToast("Kunne ikke kopiere");
              }
            }}
          >
            {copied ? (
              <Check className="size-4" aria-hidden="true" />
            ) : (
              <Copy className="size-4" aria-hidden="true" />
            )}
            {copied ? "Kopiert" : "Kopier"}
          </Button>
        </div>
        <DialogFooter>
          <Button type="button" onClick={onClose}>
            Lukk
          </Button>
        </DialogFooter>
      </ResponsiveOverlayContent>
    </ResponsiveOverlay>
  );
}

function LimitsAndUsage({ organizationId }: { organizationId: string }) {
  const callGetUsage = useServerFn(getIntegrationUsage);
  const usageQuery = useQuery({
    queryKey: ["integration-usage", organizationId],
    queryFn: () => callGetUsage(),
    staleTime: 30_000,
  });

  return (
    <PanelSection
      title="Grenser og forbruk"
      description="Grensene verner mot løpske integrasjoner og misbruk — de begrenser ikke vanlig lagersynk. Nås en grense, venter kallet til neste time eller døgn; ingen data går tapt."
    >
      {usageQuery.isLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : usageQuery.isError ? (
        <Alert variant="destructive">
          <AlertDescription>Forbruket kunne ikke lastes. Prøv igjen senere.</AlertDescription>
        </Alert>
      ) : (
        <div className="space-y-6">
          <div>
            <h4 className="mb-2 text-sm font-semibold">Per organisasjon</h4>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Grense</TableHead>
                  <TableHead>Forbruk i dag</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>
                    {INTEGRATION_LIMIT_LABELS_NB.organizationNewListingsPerDay.label}
                    <p className="text-xs text-muted-foreground">
                      {INTEGRATION_LIMIT_LABELS_NB.organizationNewListingsPerDay.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {usageQuery.data?.organization.newListingsToday ?? 0} /{" "}
                    {formatLimit(INTEGRATION_LIMITS.organization.newListingsPerDay, "")}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>
                    {INTEGRATION_LIMIT_LABELS_NB.organizationNewImagesPerDay.label}
                    <p className="text-xs text-muted-foreground">
                      {INTEGRATION_LIMIT_LABELS_NB.organizationNewImagesPerDay.description}
                    </p>
                  </TableCell>
                  <TableCell>
                    {usageQuery.data?.organization.newImagesToday ?? 0} /{" "}
                    {formatLimit(INTEGRATION_LIMITS.organization.newImagesPerDay, "")}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Bilder under behandling / feilet</TableCell>
                  <TableCell>
                    {usageQuery.data?.organization.imagesProcessing ?? 0} behandles ·{" "}
                    {usageQuery.data?.organization.imagesFailed ?? 0} feilet
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
          <div>
            <h4 className="mb-2 text-sm font-semibold">Per API-nøkkel (inneværende time)</h4>
            {usageQuery.data && usageQuery.data.keys.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lesekall</TableHead>
                    <TableHead>Skrivekall</TableHead>
                    <TableHead>Batch-kall</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {usageQuery.data.keys.map((usage) => (
                    <TableRow key={usage.keyId}>
                      <TableCell>
                        {usage.read.count} / {usage.read.limit}
                      </TableCell>
                      <TableCell>
                        {usage.write.count} / {usage.write.limit}
                      </TableCell>
                      <TableCell>
                        {usage.batch.count} / {usage.batch.limit}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-sm text-muted-foreground">Ingen aktive nøkler ennå.</p>
            )}
          </div>
        </div>
      )}
    </PanelSection>
  );
}

export function IntegrationsPanel({
  organizationId,
  locations,
}: {
  organizationId: string;
  locations: BusinessLocation[];
}) {
  const queryClient = useQueryClient();
  const [createOpen, setCreateOpen] = useState(false);
  const [revealPlaintext, setRevealPlaintext] = useState<string | null>(null);
  const [revokingKeyId, setRevokingKeyId] = useState<string | null>(null);
  const callList = useServerFn(listApiKeys);
  const callRevoke = useServerFn(revokeApiKey);

  const keysQuery = useQuery({
    queryKey: ["organization-api-keys", organizationId],
    queryFn: () => callList(),
    staleTime: 10_000,
  });

  const revokeMutation = useMutation({
    mutationFn: (keyId: string) => callRevoke({ data: { keyId } }),
    onSuccess: async () => {
      setRevokingKeyId(null);
      await queryClient.invalidateQueries({ queryKey: ["organization-api-keys", organizationId] });
      await queryClient.invalidateQueries({ queryKey: ["integration-usage", organizationId] });
    },
  });

  const activeKeys = (keysQuery.data?.keys ?? []).filter(isActive);
  const atKeyLimit = activeKeys.length >= INTEGRATION_LIMITS.apiKey.maxActiveKeysPerOrganization;

  return (
    <div className="space-y-6">
      <PanelSection
        title="API-nøkler"
        description="Brukes til å synke annonser fra deres eget lagersystem via Kaupets API."
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              disabled={atKeyLimit || locations.length === 0}
              onClick={() => setCreateOpen(true)}
            >
              <Plus className="size-4" aria-hidden="true" />
              Opprett nøkkel
            </Button>
            {atKeyLimit && (
              <p className="text-xs text-muted-foreground">
                Dere har allerede {INTEGRATION_LIMITS.apiKey.maxActiveKeysPerOrganization} aktive
                nøkler. Tilbakekall én for å opprette en ny.
              </p>
            )}
          </>
        }
      >
        {revokeMutation.error && (
          <Alert variant="destructive">
            <AlertDescription>
              {formatErrorMessage(revokeMutation.error, "Kunne ikke tilbakekalle nøkkelen.")}
            </AlertDescription>
          </Alert>
        )}
        {keysQuery.isLoading ? (
          <Skeleton className="h-20 w-full" />
        ) : keysQuery.isError ? (
          <Alert variant="destructive">
            <AlertDescription>Nøklene kunne ikke lastes. Prøv igjen senere.</AlertDescription>
          </Alert>
        ) : (keysQuery.data?.keys.length ?? 0) === 0 ? (
          <p className="text-sm text-muted-foreground">
            Ingen API-nøkler ennå. Opprett en for å synke annonser fra deres eget system.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border border-border">
            {keysQuery.data!.keys.map((key) => {
              const active = isActive(key);
              const expiringSoon = active && isExpiringSoon(key.expiresAt);
              return (
                <li key={key.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="min-w-0 space-y-1 text-sm">
                    <p className="flex items-center gap-2 font-medium">
                      <KeyRound className="size-4 text-muted-foreground" aria-hidden="true" />
                      {key.name}
                      {key.revokedAt && <Badge variant="outline">Tilbakekalt</Badge>}
                      {!key.revokedAt && !active && <Badge variant="outline">Utløpt</Badge>}
                      {expiringSoon && <Badge variant="destructive">Utløper snart</Badge>}
                    </p>
                    <p className="text-muted-foreground">
                      {key.keyPrefix}… ·{" "}
                      {key.scopes.map((scope) => SCOPE_LABELS_NB[scope] ?? scope).join(", ")}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Opprettet {formatDate(key.createdAt)} · Utløper {formatDate(key.expiresAt)} ·
                      Sist brukt {formatDate(key.lastUsedAt)}
                    </p>
                  </div>
                  {active && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setRevokingKeyId(key.id)}
                    >
                      Tilbakekall
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </PanelSection>

      <LimitsAndUsage organizationId={organizationId} />

      <PanelSection
        title="Siste importer"
        description="De siste importkjøringene fra Excel, API og MCP."
      >
        <ImportHistory organizationId={organizationId} />
      </PanelSection>

      <CreateApiKeyOverlay
        open={createOpen}
        onOpenChange={setCreateOpen}
        locations={locations}
        onCreated={(plaintext) => {
          setCreateOpen(false);
          setRevealPlaintext(plaintext);
          void queryClient.invalidateQueries({
            queryKey: ["organization-api-keys", organizationId],
          });
        }}
      />

      <RevealKeyOverlay plaintext={revealPlaintext} onClose={() => setRevealPlaintext(null)} />

      <AlertDialog open={!!revokingKeyId} onOpenChange={(open) => !open && setRevokingKeyId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tilbakekall API-nøkkel</AlertDialogTitle>
            <AlertDialogDescription>
              Integrasjoner som bruker denne nøkkelen slutter å virke umiddelbart. Dette kan ikke
              angres.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={revokeMutation.isPending}>Avbryt</AlertDialogCancel>
            <AlertDialogAction
              disabled={revokeMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (revokingKeyId) revokeMutation.mutate(revokingKeyId);
              }}
            >
              {revokeMutation.isPending && (
                <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              )}
              Tilbakekall
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
