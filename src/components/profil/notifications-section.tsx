import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { showSuccessToast, showErrorToast } from "@/lib/toast";
import { Bell, Loader2, Monitor, Smartphone, Trash2 } from "lucide-react";

import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  deletePushSubscriptionById,
  getNotificationPreferences,
  getUserPushSubscriptions,
  updateNotificationPreferences,
} from "@/lib/push.functions";
import { formatErrorMessage } from "@/lib/errors";

function parseUserAgent(ua: string | null, platform: string): string {
  if (!ua) return platform === "android" ? "Android-appen" : "Ukjent nettleser";
  if (platform === "android") return "Android-appen";
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Chrome\//.test(ua)
        ? "Chrome"
        : /Firefox\//.test(ua)
          ? "Firefox"
          : /Safari\//.test(ua)
            ? "Safari"
            : "Nettleser";
  const os = /Windows/.test(ua)
    ? "Windows"
    : /Macintosh/.test(ua)
      ? "Mac"
      : /Linux/.test(ua)
        ? "Linux"
        : /Android/.test(ua)
          ? "Android"
          : /iPhone|iPad/.test(ua)
            ? "iOS"
            : null;
  return os ? `${browser} på ${os}` : browser;
}

function formatRelativeTime(iso: string | null): string {
  if (!iso) return "Aldri";
  const diff = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 2) return "Akkurat nå";
  if (minutes < 60) return `${minutes} min siden`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} t siden`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} d siden`;
  return new Date(iso).toLocaleDateString("nb-NO", { day: "numeric", month: "short" });
}

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
  const getDevices = useServerFn(getUserPushSubscriptions);
  const deleteDevice = useServerFn(deletePushSubscriptionById);

  const { data: prefs, isLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => getPrefs({}),
  });

  const { data: devices, isLoading: devicesLoading } = useQuery({
    queryKey: ["push-subscriptions"],
    queryFn: () => getDevices({}),
  });

  const removeDeviceMutation = useMutation({
    mutationFn: async (id: string) => {
      await deleteDevice({ data: { id } });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["push-subscriptions"] });
      showSuccessToast("Enheten er fjernet");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke fjerne enheten")),
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
      showSuccessToast("Innstillingene er lagret");
    },
    onError: (e: Error) => showErrorToast(formatErrorMessage(e, "Kunne ikke lagre innstillingene")),
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
      showSuccessToast("Push-varsler er aktivert på denne enheten");
    } catch (e) {
      showErrorToast(formatErrorMessage(e, "Klarte ikke å aktivere varsler"));
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
      showSuccessToast("Denne enheten mottar ikke lenger push-varsler");
    } catch (e) {
      showErrorToast(formatErrorMessage(e, "Klarte ikke å deaktivere varsler"));
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
        <h2 className="text-lg font-medium">Enheter med push-varsler</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Alle enheter der du har aktivert push-varsler. Fjern enheter du ikke lenger bruker.
        </p>
        <div className="mt-4">
          {devicesLoading ? (
            <Loader2 className="size-5 animate-spin text-muted-foreground" />
          ) : !devices || devices.length === 0 ? (
            <p className="text-sm text-muted-foreground">Ingen enheter med push-varsler.</p>
          ) : (
            <ul className="divide-y divide-border">
              {devices.map((device) => {
                const isThisDevice =
                  device.platform === "android"
                    ? endpoint !== null && device.fcm_token === endpoint
                    : endpoint !== null && device.endpoint === endpoint;
                return (
                  <li key={device.id} className="flex items-center gap-3 py-3">
                    {device.platform === "android" ? (
                      <Smartphone className="size-5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Monitor className="size-5 shrink-0 text-muted-foreground" />
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="truncate text-sm font-medium">
                          {parseUserAgent(device.user_agent, device.platform)}
                        </span>
                        {isThisDevice && (
                          <Badge variant="secondary" className="shrink-0 text-xs">
                            Denne enheten
                          </Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground">
                        Sist aktiv: {formatRelativeTime(device.last_used_at)}
                      </p>
                    </div>
                    {!isThisDevice && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="shrink-0 text-muted-foreground hover:text-destructive"
                        disabled={removeDeviceMutation.isPending}
                        onClick={() => removeDeviceMutation.mutate(device.id)}
                        aria-label="Fjern enhet"
                      >
                        {removeDeviceMutation.variables === device.id &&
                        removeDeviceMutation.isPending ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Trash2 className="size-4" />
                        )}
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
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
          <div className="mt-6">
            <div className="grid grid-cols-[1fr_3rem_3rem] items-center gap-x-2 pb-2 text-xs font-medium text-muted-foreground">
              <span />
              <span className="text-center">Push</span>
              <span className="text-center">E-post</span>
            </div>
            <div className="divide-y divide-border">
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
                <div
                  key={row.pushKey}
                  className="grid grid-cols-[1fr_3rem_3rem] items-center gap-x-2 py-4"
                >
                  <div>
                    <Label htmlFor={`pref-${row.pushKey}`} className="text-sm font-medium">
                      {row.title}
                    </Label>
                    <p className="text-sm text-muted-foreground">{row.description}</p>
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      id={`pref-${row.pushKey}`}
                      checked={prefs[row.pushKey]}
                      disabled={mutation.isPending}
                      onCheckedChange={(v) => mutation.mutate({ ...prefs, [row.pushKey]: v })}
                    />
                  </div>
                  <div className="flex justify-center">
                    <Switch
                      id={`pref-${row.emailKey}`}
                      checked={prefs[row.emailKey]}
                      disabled={mutation.isPending}
                      onCheckedChange={(v) => mutation.mutate({ ...prefs, [row.emailKey]: v })}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
