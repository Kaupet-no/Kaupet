import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Bell, Loader2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  getCurrentEndpoint,
  getPermissionState,
  pushSupported,
  subscribe as subscribePush,
  unsubscribeThisDevice,
} from "@/lib/push";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/push.functions";
import { formatErrorMessage } from "@/lib/errors";

export function NotificationsSection() {
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
      web_push_sold: boolean;
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
                    web_push_sold: prefs.web_push_sold,
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
                    web_push_sold: prefs.web_push_sold,
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
                    web_push_sold: prefs.web_push_sold,
                  })
                }
              />
            </div>

            <div className="flex items-center justify-between gap-4">
              <div>
                <Label htmlFor="pref-sold" className="text-sm font-medium">
                  Favoritt blir solgt
                </Label>
                <p className="text-sm text-muted-foreground">
                  Varsel når en favoritt-annonse blir markert som solgt.
                </p>
              </div>
              <Switch
                id="pref-sold"
                checked={prefs.web_push_sold}
                disabled={mutation.isPending}
                onCheckedChange={(v) =>
                  mutation.mutate({
                    web_push_messages: prefs.web_push_messages,
                    web_push_saved_searches: prefs.web_push_saved_searches,
                    web_push_price_drops: prefs.web_push_price_drops,
                    web_push_sold: v,
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
