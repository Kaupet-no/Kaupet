import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";

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
  const [secret, setSecret] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = async (m: "test" | "production" = mode) => {
    setBusy(true);
    try {
      const res = await list({ data: { mode: m } });
      setHooks(res.webhooks ?? []);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Kunne ikke hente webhooks");
    } finally {
      setBusy(false);
    }
  };

  const onRegister = async () => {
    setBusy(true);
    setSecret(null);
    try {
      const res = await register({ data: { mode, url } });
      setSecret(res.secret);
      toast.success("Webhook registrert. Kopier secret nedenfor og legg inn som env-variabel.");
      await refresh(mode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Registrering feilet");
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async (id: string) => {
    if (!confirm("Slette denne webhooken?")) return;
    setBusy(true);
    try {
      await remove({ data: { mode, id } });
      toast.success("Webhook slettet");
      await refresh(mode);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Sletting feilet");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-4">
      <div>
        <h1 className="text-2xl font-semibold">Vipps webhooks</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Registrer webhook hos Vipps for å motta betalingshendelser. Vipps genererer en{" "}
          <code className="rounded bg-muted px-1">secret</code> som vises én gang og må lagres som
          env-variabel: <code>VIPPS_TEST_WEBHOOK_SECRET</code> (test) eller{" "}
          <code>VIPPS_WEBHOOK_SECRET</code> (produksjon).
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

          {secret && (
            <div className="rounded-md border border-yellow-400 bg-yellow-50 p-4">
              <p className="text-sm font-semibold text-yellow-900">
                Kopier denne secret-en NÅ — den vises bare én gang
              </p>
              <pre className="mt-2 break-all rounded bg-white p-2 text-xs">{secret}</pre>
              <p className="mt-2 text-xs text-yellow-900">
                Lagre som <code>{mode === "test" ? "VIPPS_TEST_WEBHOOK_SECRET" : "VIPPS_WEBHOOK_SECRET"}</code>{" "}
                i prosjektets env-variabler.
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
