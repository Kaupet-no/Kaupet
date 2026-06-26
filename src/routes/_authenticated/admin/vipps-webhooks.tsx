import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { showSuccessToast, showErrorToast } from "@/lib/toast";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  listVippsWebhooks,
  registerVippsWebhook,
  deleteVippsWebhook,
} from "@/lib/vipps-admin.functions";

export const Route = createFileRoute("/_authenticated/admin/vipps-webhooks")({
  head: () => ({ meta: [{ title: "Vipps webhooks — Admin" }] }),
  component: VippsWebhooksPage,
});

function VippsWebhooksPage() {
  const list = useServerFn(listVippsWebhooks);
  const register = useServerFn(registerVippsWebhook);
  const remove = useServerFn(deleteVippsWebhook);

  const [mode, setMode] = useState<"test" | "production">("test");
  const [url, setUrl] = useState("https://test.kaupet.no/api/public/vipps/webhook");
  const [hooks, setHooks] = useState<Array<{ id: string; url: string; events: string[] }>>([]);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async (m: "test" | "production" = mode) => {
    setBusy(true);
    try {
      const res = await list({ data: { mode: m } });
      setHooks(res.webhooks ?? []);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Kunne ikke hente webhooks");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async () => {
    setBusy(true);
    setSavedId(null);
    try {
      const res = await register({ data: { mode, url } });
      setSavedId(res.id);
      showSuccessToast("Webhook registrert og secret lagret automatisk i databasen.");
      await refresh(mode);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Registrering feilet");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Slette denne webhooken?")) return;
    setBusy(true);
    try {
      await remove({ data: { mode, id } });
      showSuccessToast("Webhook slettet");
      await refresh(mode);
    } catch (e) {
      showErrorToast(e instanceof Error ? e.message : "Sletting feilet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Vipps webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrer webhook hos Vipps for å motta betalingshendelser. Den genererte secret-en lagres
          automatisk i databasen og brukes av webhook-handleren for å verifisere signaturen — ingen
          manuelle env-variabler nødvendig.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Miljø</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Button
              variant={mode === "test" ? "default" : "outline"}
              onClick={() => {
                setMode("test");
                setUrl("https://test.kaupet.no/api/public/vipps/webhook");
                void refresh("test");
              }}
            >
              Test
            </Button>
            <Button
              variant={mode === "production" ? "default" : "outline"}
              onClick={() => {
                setMode("production");
                setUrl("https://kaupet.no/api/public/vipps/webhook");
                void refresh("production");
              }}
            >
              Produksjon
            </Button>
            <Button variant="ghost" onClick={() => void refresh()} disabled={busy}>
              Oppdater liste
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor="url">Webhook-URL</Label>
            <Input id="url" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button onClick={onRegister} disabled={busy || !url}>
              Registrer webhook ({mode})
            </Button>
          </div>

          {savedId && (
            <div className="rounded-md border border-green-500 bg-green-50 p-4">
              <p className="text-sm font-semibold text-green-900">
                Webhook registrert og secret lagret automatisk
              </p>
              <p className="mt-1 text-xs text-green-900">
                Webhook-id: <code className="rounded bg-white px-1">{savedId}</code>. Signaturen
                verifiseres heretter mot lagret secret i databasen.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Registrerte webhooks ({mode})</CardTitle>
        </CardHeader>
        <CardContent>
          {hooks.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ingen registrerte. Klikk "Oppdater liste" eller registrer en ny.
            </p>
          ) : (
            <ul className="space-y-2">
              {hooks.map((h) => (
                <li
                  key={h.id}
                  className="flex flex-col gap-1 rounded-md border p-3 text-sm sm:flex-row sm:items-start sm:justify-between"
                >
                  <div className="min-w-0">
                    <p className="break-all font-mono text-xs">{h.url}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {h.events.length} hendelser · id: {h.id}
                    </p>
                  </div>
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => void onDelete(h.id)}
                    disabled={busy}
                  >
                    Slett
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
