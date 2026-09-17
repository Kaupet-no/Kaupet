package no.kaupet.app;

import android.content.Context;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Mirrors the app's resolved theme (kaupet_theme in localStorage, see
// src/hooks/use-theme.tsx) into SharedPreferences, so MainActivity can read
// it when injecting CSS into the local shell pages (capacitor-shell/*.html —
// offline.html, index.html). Those pages are served from this app's own
// local origin, never the Bridge's configured server.url (kaupet.no /
// staging.kaupet.no), so window.Capacitor is never injected there (same
// origin-scoping as ServerTargetPlugin's problem — see MainActivity for the
// injection side of this). A plugin call from the real app origin (where the
// bridge DOES work) is how the choice gets to native at all.
@CapacitorPlugin(name = "ShellTheme")
public class ShellThemePlugin extends Plugin {

    static final String PREFS = "shell_theme";
    static final String KEY_DARK = "dark";

    @PluginMethod
    public void set(PluginCall call) {
        boolean dark = Boolean.TRUE.equals(call.getBoolean("dark", false));
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().putBoolean(KEY_DARK, dark).apply();
        call.resolve();
    }
}
