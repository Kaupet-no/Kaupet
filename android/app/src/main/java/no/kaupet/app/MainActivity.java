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
    }
}
