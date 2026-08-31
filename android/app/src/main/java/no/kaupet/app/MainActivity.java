package no.kaupet.app;

import android.os.Bundle;
import android.webkit.CookieManager;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // Cloudflare Access (staging.kaupet.no) setter cf_authorization-cookien
        // underveis i en redirect-kjede via *.cloudflareaccess.com. WebView
        // blokkerer tredjeparts-cookies med mindre dette skrus på eksplisitt —
        // uten det mislykkes innlogging stille og BridgeWebViewClient sender
        // brukeren til offline.html.
        CookieManager.getInstance().setAcceptThirdPartyCookies(getBridge().getWebView(), true);
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
