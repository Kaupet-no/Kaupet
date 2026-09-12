package no.kaupet.app;

import android.view.HapticFeedbackConstants;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.PluginMethod;

// Bridge to the system's own short KEYBOARD_TAP haptic (10-20ms), which
// @capacitor/haptics has no way to reach on Android — see docs/UI-GUIDE.md
// and the task report for why ImpactStyle.Light is too heavy there.
@CapacitorPlugin(name = "SoftHaptics")
public class SoftHapticsPlugin extends Plugin {
  @PluginMethod
  public void tap(PluginCall call) {
    // No FLAG_IGNORE_GLOBAL_SETTING: this respects the user's system
    // haptics-on/off setting, which is the correct behavior.
    getBridge().getWebView().performHapticFeedback(HapticFeedbackConstants.KEYBOARD_TAP);
    call.resolve();
  }
}
