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
import {
  getCurrentNativeToken,
  getNativePermissionState,
  nativePushSupported,
  subscribeNative,
  unsubscribeNative,
} from "@/lib/native-push";
import { getNotificationPreferences, updateNotificationPreferences } from "@/lib/push.functions";
import { formatErrorMessage } from "@/lib/errors";

export function NotificationsSection() {
  const queryClient = useQueryClient();
  const isNativeAndroid = nativePushSupported();
  const supported = isNativeAndroid || pushSupported();
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [busy, setBusy] = useState<null | "subscribe" | "unsubscribe">(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const state = isNativeAndroid ? await getNativePermissionState() : getPermissionState();
      if (!cancelled) setPermission(state);
    })();
    return () => {
      cancelled = true;
    };
  }, [isNativeAndroid]);

  const getPrefs = useServerFn(getNotificationPreferences);
  const updatePrefs = useServerFn(updateNotificationPreferences);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => getPrefs({}),
  });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const ep = isNativeAndroid ? await getCurrentNativeToken() : await getCurrentEndpoint();
      if (!cancelled) setEndpoint(ep);
    })();
    return () => {
      cancelled = true;
    };
  }, [permission, isNativeAndroid]);

  const mutation = useMutation({
    mutationFn: async (values: {
      web_push_messages: boolean;
      web_push_saved_searches: boolean;
      web_push_price_drops: boolean;
      web_push_sold: boolean;
      email_messages: boolean;
      email_saved_searches: boolean;
      email_price_drops: boolean;
      email_sold: boolean;
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
      if (isNativeAndroid) {
        await subscribeNative();
        setPermission(await getNativePermissionState());
        setEndpoint(await getCurrentNativeToken());
      } else {
        await subscribePush();
        setPermission(getPermissionState());
        setEndpoint(await getCurrentEndpoint());
      }
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
      if (isNativeAndroid) {
        await unsubscribeNative();
      } else {
        await unsubscribeThisDevice();
      }
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
            <h2 className="text-lg font-medium">Push-varsler</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              {isNativeAndroid
                ? "Få varsler om nye meldinger og treff i lagrede søk selv når appen ikke er åpen."
                : "Få varsler om nye meldinger og treff i lagrede søk selv når Kaupet.no ikke er åpen. På iPhone må du først legge til Kaupet.no på hjem-skjermen."}
            </p>

            {!supported ? (
              <p className="mt-4 text-sm text-muted-foreground">
                Push-varsler er ikke tilgjengelig i denne nettleseren eller i en innebygd
                forhåndsvisning. Åpne <strong>kaupet.no</strong> direkte for å aktivere.
              </p>
            ) : permission === "denied" ? (
              <p className="mt-4 text-sm text-destructive">
                {isNativeAndroid
                  ? "Du har blokkert varsler for Kaupet. Endre tillatelsen i Android-innstillingene for å aktivere på nytt."
                  : "Du har blokkert varsler for kaupet.no. Endre tillatelsen i nettleserinnstillingene for å aktivere på nytt."}
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
          Disse innstillingene gjelder for alle enhetene dine. Push-varsler krever at du aktiverer
          dem på enheten over; e-postvarsler sendes til kontoens e-postadresse.
        </p>

        {isLoading || !prefs ? (
          <Loader2 className="mt-4 size-5 animate-spin text-muted-foreground" />
        ) : (
          <div className="mt-6 space-y-5">
            {(
              [
                {
                  pushKey: "web_push_messages",
                  emailKey: "email_messages",
                  title: "Nye chat-meldinger",
                  description: "Varsel når noen sender deg en melding om en annonse.",
                },
                {
                  pushKey: "web_push_saved_searches",
                  emailKey: "email_saved_searches",
                  title: "Treff i lagrede søk",
                  description: "Varsel når en ny annonse matcher et av søkene dine.",
                },
                {
                  pushKey: "web_push_price_drops",
                  emailKey: "email_price_drops",
                  title: "Prisfall på favoritter",
                  description: "Varsel når en favoritt-annonse blir satt ned med mer enn 5 %.",
                },
                {
                  pushKey: "web_push_sold",
                  emailKey: "email_sold",
                  title: "Favoritt blir solgt",
                  description: "Varsel når en favoritt-annonse blir markert som solgt.",
                },
              ] as const
            ).map((row) => (
              <div key={row.pushKey} className="flex items-center justify-between gap-4">
                <div>
                  <Label htmlFor={`pref-${row.pushKey}`} className="text-sm font-medium">
                    {row.title}
                  </Label>
                  <p className="text-sm text-muted-foreground">{row.description}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      id={`pref-${row.pushKey}`}
                      checked={prefs[row.pushKey]}
                      disabled={mutation.isPending}
                      onCheckedChange={(v) => mutation.mutate({ ...prefs, [row.pushKey]: v })}
                    />
                    <span className="text-xs text-muted-foreground">Push</span>
                  </div>
                  <div className="flex flex-col items-center gap-1">
                    <Switch
                      id={`pref-${row.emailKey}`}
                      checked={prefs[row.emailKey]}
                      disabled={mutation.isPending}
                      onCheckedChange={(v) => mutation.mutate({ ...prefs, [row.emailKey]: v })}
                    />
                    <span className="text-xs text-muted-foreground">E-post</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
