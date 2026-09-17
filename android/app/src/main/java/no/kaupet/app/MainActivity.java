package no.kaupet.app;

import android.content.SharedPreferences;
import android.content.res.AssetManager;
import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.CapConfig;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileWriter;
import java.io.IOException;
import java.io.InputStream;
import org.json.JSONException;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // SoftHapticsPlugin and ServerTargetPlugin live in this app module,
        // not an npm package, so Capacitor's plugin autodiscovery (which
        // scans node_modules) never finds them — they must be registered
        // manually, before super.onCreate().
        registerPlugin(SoftHapticsPlugin.class);
        registerPlugin(ServerTargetPlugin.class);

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
