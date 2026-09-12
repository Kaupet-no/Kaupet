package no.kaupet.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // SoftHapticsPlugin lives in this app module, not an npm package, so
        // Capacitor's plugin autodiscovery (which scans node_modules) never
        // finds it — it must be registered manually, before super.onCreate().
        registerPlugin(SoftHapticsPlugin.class);
        super.onCreate(savedInstanceState);
        // Cloudflare Access is only used by the isolated staging flavor.
        // Production must not accept third-party cookies from arbitrary
        // redirect domains.
        if (getApplicationInfo().packageName.endsWith(".staging")) {
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
}
