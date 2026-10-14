package no.kaupet.app;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

// Bro til systemets tekststørrelse (Configuration.fontScale). MainActivity
// låser WebView-ens textZoom til 100 så OS-innstillingen ikke skalerer all
// layout; webappen leser i stedet skalaen herfra og skalerer bare
// typografitokens (src/lib/text-scale.ts), som på iOS.
@CapacitorPlugin(name = "TextScale")
public class TextScalePlugin extends Plugin {
    @PluginMethod
    public void get(PluginCall call) {
        JSObject result = new JSObject();
        result.put("fontScale", getContext().getResources().getConfiguration().fontScale);
        call.resolve(result);
    }
}
