import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import {
  getCurrentEndpoint,
  getPermissionState,
  pushSupported,
  subscribe as subscribePush,
} from "@/lib/push";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
} from "@/lib/push.functions";
import { useAuth } from "@/lib/auth";

export type PushStatus = {
  /** Browser supports push and we're in an allowed environment. */
  supported: boolean;
  /** Notification permission state, or "unsupported". */
  permission: NotificationPermission | "unsupported";
  /** True when this device has an active push subscription. */
  subscribedHere: boolean;
  /** User's per-type prefs (defaults to true when not loaded yet). */
  prefs: {
    web_push_messages: boolean;
    web_push_saved_searches: boolean;
  };
  /** True until we've checked browser + server state once. */
  loading: boolean;
  /** Convenience: push will actually deliver messages on this device. */
  messagesActive: boolean;
  /** Convenience: push will actually deliver saved-search hits on this device. */
  savedSearchesActive: boolean;
  /**
   * Subscribe this device and ensure the given per-type pref is on.
   * Returns true on success, throws on failure.
   */
  enableOnThisDevice: (kind?: "messages" | "saved_searches") => Promise<void>;
  refresh: () => void;
};

export function usePushStatus(): PushStatus {
  const { user } = useAuth();
  const qc = useQueryClient();
  const getPrefs = useServerFn(getNotificationPreferences);
  const updatePrefs = useServerFn(updateNotificationPreferences);

  const [supported, setSupported] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission | "unsupported">(
    "unsupported",
  );
  const [endpoint, setEndpoint] = useState<string | null>(null);
  const [browserReady, setBrowserReady] = useState(false);

  const refreshBrowser = async () => {
    const ok = pushSupported();
    setSupported(ok);
    setPermission(getPermissionState());
    setEndpoint(ok ? await getCurrentEndpoint() : null);
    setBrowserReady(true);
  };

  useEffect(() => {
    void refreshBrowser();
  }, []);

  const { data: prefs, isLoading: prefsLoading } = useQuery({
    queryKey: ["notification-preferences"],
    queryFn: () => getPrefs({}),
    enabled: !!user,
  });

  const effectivePrefs = {
    web_push_messages: prefs?.web_push_messages ?? true,
    web_push_saved_searches: prefs?.web_push_saved_searches ?? true,
  };

  const subscribedHere = !!endpoint && permission === "granted";

  const enableOnThisDevice = async (kind?: "messages" | "saved_searches") => {
    await subscribePush();
    await refreshBrowser();
    if (kind) {
      const next = {
        web_push_messages:
          kind === "messages" ? true : effectivePrefs.web_push_messages,
        web_push_saved_searches:
          kind === "saved_searches" ? true : effectivePrefs.web_push_saved_searches,
      };
      if (
        next.web_push_messages !== effectivePrefs.web_push_messages ||
        next.web_push_saved_searches !== effectivePrefs.web_push_saved_searches
      ) {
        await updatePrefs({ data: next });
        await qc.invalidateQueries({ queryKey: ["notification-preferences"] });
      }
    }
  };

  return {
    supported,
    permission,
    subscribedHere,
    prefs: effectivePrefs,
    loading: !browserReady || (!!user && prefsLoading),
    messagesActive: subscribedHere && effectivePrefs.web_push_messages,
    savedSearchesActive: subscribedHere && effectivePrefs.web_push_saved_searches,
    enableOnThisDevice,
    refresh: () => {
      void refreshBrowser();
      void qc.invalidateQueries({ queryKey: ["notification-preferences"] });
    },
  };
}
