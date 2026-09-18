package no.kaupet.app;

import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.net.Uri;
import android.os.Bundle;
import android.webkit.CookieManager;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import com.capacitorjs.plugins.splashscreen.SplashScreenSettings;
import com.getcapacitor.Logger;
import com.getcapacitor.PluginHandle;
import com.getcapacitor.WebViewListener;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.Locale;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // SoftHapticsPlugin, ServerTargetPlugin and ShellThemePlugin live in
        // this app module, not an npm package, so Capacitor's plugin
        // autodiscovery (which scans node_modules) never finds them — they
        // must be registered manually, before super.onCreate().
        registerPlugin(SoftHapticsPlugin.class);
        // ServerTargetPlugin is staging-only, the same boundary iOS draws with
        // #if DEBUG (see KaupetBridgeViewController.capacitorDidLoad in
        // AppDelegate.swift, and the reasoning in its comment there): set()
        // decides what origin every future cold launch is built against, and
        // must not be callable from JS running on the bridge origin in a signed
        // production build. Gating only the READ of the stored value still left
        // set() reachable — and it calls recreate().
        if (isStaging()) {
            registerPlugin(ServerTargetPlugin.class);
        }
        registerPlugin(ShellThemePlugin.class);
        registerPlugin(AuthCookiesPlugin.class);

        // Staging's "Velg server" screen (capacitor-shell/index.html) and
        // the in-app DevServerSwitch persist their choice via
        // ServerTargetPlugin instead of redirecting the live WebView there.
        // If a choice is stored, build the Bridge's config with server.url
        // already pointing at it — set on `config` (read by
        // BridgeActivity.load(), called from super.onCreate()) BEFORE
        // super.onCreate() runs. A runtime redirect never gets Capacitor's
        // plugin-dispatch JS injection (scoped to the origin the Bridge was
        // created with — see Bridge.loadWebView in
        // node_modules/@capacitor/android), which is why every native
        // plugin used to die on staging once the user picked a server.
        // Without a stored choice, the shell loads exactly as it does today.
        if (isStaging()) {
            SharedPreferences prefs = getSharedPreferences(ServerTargetPlugin.PREFS, MODE_PRIVATE);
            String target = prefs.getString(ServerTargetPlugin.KEY_URL, null);
            if (target != null) {
                CapConfig overridden = configWithServerUrl(target);
                if (overridden != null) {
                    config = overridden;
                }
            }
        }

        super.onCreate(savedInstanceState);
        // Cloudflare Access is only used by the isolated staging flavor.
        // Production must not accept third-party cookies from arbitrary
        // redirect domains.
        if (isStaging()) {
            CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);
        }
        // WebView følger som standard Configuration.fontScale (systemets
        // tekststørrelse) via textZoom, og skalerer da ALT tekstrelatert —
        // inkludert rem-baserte avstander, ikonstørrelser og treffområder som
        // ikke er ment å vokse. Ved fontScale 2.0 overlappet bunnavigasjonens
        // etiketter og navigasjonen dekket sideinnhold. Vi låser textZoom til
        // 100 og styrer i stedet lesbarhet selv via appens egne
        // Tailwind-typografitokens (se src/lib/text-scale.ts og
        // src/styles.css), som iOS allerede bruker. En tilsvarende Android-bro
        // til Configuration.fontScale finnes ikke ennå — det er en egen,
        // fremtidig utvidelse, ikke del av denne endringen.
        getBridge().getWebView().getSettings().setTextZoom(100);

        // capacitor-shell/offline.html and index.html are served from this
        // app's own local origin (the errorPath fallback and, on staging
        // without a stored server choice, the "Velg server" screen), never
        // from server.url — so window.Capacitor is never injected there (see
        // ShellThemePlugin). Mirror the app's own theme choice in ourselves,
        // the same way SystemBars mirrors safe-area insets into
        // --safe-area-inset-* regardless of origin: evaluateJavascript runs
        // on whatever page is currently loaded, unlike the origin-scoped
        // plugin-dispatch bridge.
        getBridge().addWebViewListener(
            new WebViewListener() {
                @Override
                public void onPageCommitVisible(WebView view, String url) {
                    super.onPageCommitVisible(view, url);
                    if (isLocalShellPage(url)) {
                        injectShellTheme(view);
                    }
                    if (!isBridgeOrigin(url)) {
                        hideSplash();
                    }
                    recoverFromDeadServerTarget(url);
                }
            }
        );
    }

    // Sesjonen ligger i en informasjonskapsel (se
    // src/integrations/supabase/client.ts). WebView holder kapsler i minnet og
    // skriver dem til disk først ved CookieManager.flush() — i motsetning til
    // localStorage, som den persisterte selv. Uten denne flushen mistet appen
    // sesjonen ved omstart: verifisert i emulator, der innlogget bruker kom
    // tilbake som utlogget etter at prosessen ble drept.
    //
    // onPause er det siste punktet vi garantert får før prosessen kan bli
    // avlivet. Dette endrer ikke tredjepartskapsel-avveiningen i onCreate.
    @Override
    public void onPause() {
        super.onPause();
        CookieManager.getInstance().flush();
    }


    private boolean isLocalShellPage(String url) {
        Uri uri = Uri.parse(url);
        return getBridge().getScheme().equals(uri.getScheme()) && getBridge().getHost().equals(uri.getHost());
    }

    // The origin the Bridge was created with — server.url's origin when one
    // is set, otherwise the local https://localhost. Capacitor scopes its
    // plugin-dispatch injection to exactly this origin (Bridge.loadWebView),
    // so it is also the only origin a SplashScreen.hide() over the bridge can
    // ever arrive from.
    private boolean isBridgeOrigin(String url) {
        Uri page = Uri.parse(url);
        Uri bridge = Uri.parse(getBridge().getLocalUrl());
        return (
            bridge.getScheme() != null &&
            bridge.getScheme().equals(page.getScheme()) &&
            bridge.getAuthority() != null &&
            bridge.getAuthority().equals(page.getAuthority())
        );
    }

    // The same origin-scoping hides the splash screen forever. A
    // SplashScreen.hide() call over the bridge is the only thing that dismisses
    // the native splash before launchShowDuration's 15s safety valve expires
    // (see capacitor.config.ts), and that bridge is scoped to the single origin
    // it was created with. Every page outside that
    // origin is therefore mute: offline.html and index.html on the local
    // origin once a server.url is set (F19, cold launch with no network), but
    // equally Cloudflare Access' login wall on staging, any OAuth redirect and
    // any error page served by a proxy in between — each one left the branded
    // splash frozen on top with force-quit the only way out. The rule is the
    // origin, not the page: if something painted that the bridge can never
    // hear from, the splash has to go.
    private void hideSplash() {
        try {
            PluginHandle handle = getBridge().getPlugin("SplashScreen");
            if (handle == null || handle.getInstance() == null) {
                return;
            }
            // SplashScreenPlugin.hide() takes a PluginCall it reads settings
            // from, and a PluginCall without a MessageHandler throws in
            // resolve(). The underlying SplashScreen has an ordinary public
            // hide(SplashScreenSettings), but the field holding it is private
            // with no getter — one reflective lookup is the shortest way in.
            // ponytail: tied to the field name in @capacitor/splash-screen;
            // switch if the plugin ever gets a public native hide().
            Field field = handle.getInstance().getClass().getDeclaredField("splashScreen");
            field.setAccessible(true);
            Object splashScreen = field.get(handle.getInstance());
            if (splashScreen instanceof com.capacitorjs.plugins.splashscreen.SplashScreen) {
                ((com.capacitorjs.plugins.splashscreen.SplashScreen) splashScreen).hide(new SplashScreenSettings());
            }
        } catch (Exception e) {
            // Without this the splash stays up forever — log loudly.
            Logger.error("Klarte ikke skjule splashen", e);
        }
    }

    private void injectShellTheme(WebView view) {
        SharedPreferences prefs = getSharedPreferences(ShellThemePlugin.PREFS, MODE_PRIVATE);
        if (!prefs.contains(ShellThemePlugin.KEY_DARK)) {
            // No known app choice yet (fresh install, theme never applied) —
            // leave the page's own `@media (prefers-color-scheme)` fallback
            // in charge instead of forcing a value.
            return;
        }
        String theme = prefs.getBoolean(ShellThemePlugin.KEY_DARK, false) ? "dark" : "light";
        String script = String.format(
            Locale.US,
            "document.documentElement.setAttribute('data-theme', '%s');",
            theme
        );
        view.evaluateJavascript(script, null);
    }

    // Redder appen ut av en død dev-server uten å røre UI. Når et servermål
    // ligger lagret, er Bridge-en bygget mot DET målet (se onCreate), så
    // "Velg server"-skjermen (capacitor-shell/index.html) lastes aldri igjen
    // — den vises kun når INGEN mål er lagret. Slutter Vite-serveren å svare
    // (utviklerens maskin sover, byttet nettverk), faller Capacitor tilbake
    // på errorPath: capacitor-shell/offline.html, servert fra appens egen
    // lokale origin. Der er window.Capacitor aldri injisert — plugin-dispatch
    // er origin-scoped til origin-en Bridge-en ble opprettet med (server.url),
    // ikke den lokale origin-en siden er servert fra — så offline.html kan
    // ikke kalle ServerTarget.set({url: null}) for å rydde opp selv.
    // DevServerSwitch, som ellers kunne løst det samme, ligger i SPA-en som
    // aldri booter. Uten dette er eneste vei ut å slette appdata eller
    // installere på nytt.
    //
    // Regelen er trygg: lagret mål ⇒ Bridge mot det målet ⇒ lokal shell-side
    // kan kun nås via errorPath ⇒ målet er dødt. Etter recreate() er intet
    // mål lagret lenger, så neste Bridge bygges mot den lokale origin-en, og
    // DA er "siden er lokal shell" den NORMALE tilstanden — men betingelsen
    // under er da false (ingenting er lagret), så det looper aldri.
    //
    // Bevisst avveining: en forbigående nettverksfeil mot et ellers GYLDIG
    // staging-mål trigger det samme og sender utvikleren tilbake til
    // velgeren. Det er akseptabelt for et rent utviklerverktøy — ikke "fiks"
    // dette til å skille de to tilfellene.
    private void recoverFromDeadServerTarget(String url) {
        if (!isStaging() || !isLocalShellPage(url)) {
            return;
        }
        SharedPreferences prefs = getSharedPreferences(ServerTargetPlugin.PREFS, MODE_PRIVATE);
        if (!prefs.contains(ServerTargetPlugin.KEY_URL)) {
            return;
        }
        prefs.edit().remove(ServerTargetPlugin.KEY_URL).apply();
        runOnUiThread(this::recreate);
    }

    private boolean isStaging() {
        return getApplicationInfo().packageName.endsWith(".staging");
    }

    // Builds a CapConfig identical to the bundled capacitor.config.json,
    // except with server.url overridden to the chosen target. Every other
    // setting (allowNavigation, plugin config, ...) stays exactly what
    // `cap sync` generated instead of being hand-duplicated here: the
    // bundled JSON is copied out with just "server.url" patched, then
    // loaded back through CapConfig.loadFromFile(Context, String) — not the
    // JSONObject constructor, which hardcodes a null Context internally and
    // so silently disables loggingEnabled/webContentsDebuggingEnabled
    // (both default to "only in a debuggable build", which that null
    // Context can't detect).
    private CapConfig configWithServerUrl(String serverUrl) {
        try {
            JSONObject json = new JSONObject(readAsset("capacitor.config.json"));
            JSONObject server = json.optJSONObject("server");
            if (server == null) {
                server = new JSONObject();
                json.put("server", server);
            }
            server.put("url", serverUrl);

            File dir = new File(getFilesDir(), "capacitor-config-override");
            dir.mkdirs();
            try (FileWriter writer = new FileWriter(new File(dir, "capacitor.config.json"))) {
                writer.write(json.toString());
            }
            return CapConfig.loadFromFile(this, dir.getPath() + "/");
        } catch (IOException | JSONException e) {
            return null;
        }
    }

    private String readAsset(String name) throws IOException {
        AssetManager assets = getAssets();
        try (InputStream in = assets.open(name)) {
            ByteArrayOutputStream out = new ByteArrayOutputStream();
            byte[] buffer = new byte[4096];
            int read;
            while ((read = in.read(buffer)) != -1) {
                out.write(buffer, 0, read);
            }
            return out.toString("UTF-8");
        }
    }
}
