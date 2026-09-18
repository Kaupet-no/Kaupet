package no.kaupet.app;

import android.content.Context;
import android.content.SharedPreferences;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.MalformedURLException;
import java.net.URL;

// Persists the "Velg server" choice (capacitor-shell/index.html,
// src/components/dev-server-switch.tsx) natively and restarts the activity,
// so the NEXT Bridge is created with server.url already pointing at the
// chosen target instead of being reached by a runtime WebView redirect — see
// MainActivity.onCreate. A runtime redirect never gets Capacitor's
// plugin-dispatch JS injection, because that injection
// (WebViewCompat.addDocumentStartJavaScript in Bridge.loadWebView, see
// node_modules/@capacitor/android) is scoped to the single origin the
// Bridge was created with.
//
// Registered by MainActivity.onCreate ONLY on the staging flavor (package name
// ending in ".staging") — the same boundary iOS draws with #if DEBUG, see
// KaupetBridgeViewController.capacitorDidLoad in AppDelegate.swift. set()
// decides what origin every future cold launch is built against, so it must not
// be reachable from JS running on the bridge origin in a signed production
// build; gating only the READ of the stored value would leave set() — which
// calls recreate() — callable. In production the plugin is simply not
// registered, and a call from JS rejects with "not implemented".
@CapacitorPlugin(name = "ServerTarget")
public class ServerTargetPlugin extends Plugin {

    static final String PREFS = "server_target";
    static final String KEY_URL = "url";

    @PluginMethod
    public void set(PluginCall call) {
        String requested = call.getString("url");
        String resolved = null;
        if (requested != null && !requested.isEmpty()) {
            resolved = validate(requested);
            if (resolved == null) {
                call.reject("Ugyldig servermål");
                return;
            }
        }

        SharedPreferences.Editor editor = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        if (resolved != null) {
            editor.putString(KEY_URL, resolved);
        } else {
            editor.remove(KEY_URL);
        }
        editor.apply();

        call.resolve();
        // Cold-load a fresh Bridge against the new (or cleared) target
        // instead of navigating the live WebView there.
        getActivity().runOnUiThread(() -> getActivity().recreate());
    }

    // Re-validates server-side — never trust the JS caller alone, since this
    // value decides what origin the next Bridge is created with. Mirrors
    // capacitor-shell/index.html's localDevServerUrl(): staging.kaupet.no
    // over https, or localhost/a private IPv4 over http.
    private static String validate(String value) {
        URL url;
        try {
            url = new URL(value);
        } catch (MalformedURLException e) {
            return null;
        }
        String host = url.getHost();
        if ("https".equals(url.getProtocol()) && "staging.kaupet.no".equals(host)) {
            return "https://staging.kaupet.no";
        }
        if (!"http".equals(url.getProtocol())) return null;
        int port = url.getPort();
        if (port < 1 || port > 65535) return null;
        if (!"127.0.0.1".equals(host) && !"localhost".equals(host) && !isPrivateIPv4(host)) {
            return null;
        }
        return "http://" + host + ":" + port;
    }

    private static boolean isPrivateIPv4(String host) {
        String[] parts = host.split("\\.");
        if (parts.length != 4) return false;
        int[] octets = new int[4];
        for (int i = 0; i < 4; i++) {
            try {
                octets[i] = Integer.parseInt(parts[i]);
            } catch (NumberFormatException e) {
                return false;
            }
            if (octets[i] < 0 || octets[i] > 255) return false;
        }
        return (
            octets[0] == 10 ||
            (octets[0] == 172 && octets[1] >= 16 && octets[1] <= 31) ||
            (octets[0] == 192 && octets[1] == 168)
        );
    }
}
