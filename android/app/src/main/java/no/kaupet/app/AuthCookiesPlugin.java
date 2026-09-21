package no.kaupet.app;

import android.webkit.CookieManager;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Skriver WebViewens informasjonskapsler til disk umiddelbart.
//
// Sesjonen ligger i en kapsel (se src/integrations/supabase/client.ts).
// WebView holder kapsler i minnet og persisterer dem først ved flush().
// MainActivity.onPause() flusher, men den kjører ikke hvis prosessen dør mens
// appen er i forgrunnen (krasj, «Tvangsstopp» i innstillinger, OOM-drap).
//
// Uten denne broen gikk to ting galt, begge verifisert i emulator:
//
//  1. Innlogging som ikke overlevde omstart.
//  2. VERRE: utlogging som ikke festet seg. Kapselen ble slettet i minnet,
//     men den gamle kapselen lå igjen på disk, og etter et forgrunnsdrap kom
//     brukeren tilbake som innlogget. På en delt enhet betyr det at neste
//     person åpner appen med forrige brukers sesjon.
//
// Web-laget kaller flush() ved hver endring i auth-tilstanden (se
// src/lib/native-cookies.ts), altså i det kapselen faktisk er skrevet eller
// slettet, i stedet for å håpe på en livssyklus vi ikke får.
@CapacitorPlugin(name = "AuthCookies")
public class AuthCookiesPlugin extends Plugin {

    @PluginMethod
    public void flush(PluginCall call) {
        CookieManager.getInstance().flush();
        call.resolve();
    }
}
