package no.kaupet.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.os.Build;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebStorage;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.runner.lifecycle.ActivityLifecycleMonitorRegistry;
import androidx.test.runner.lifecycle.Stage;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.util.function.BooleanSupplier;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.io.File;
import java.io.FileOutputStream;
import org.json.JSONObject;
import org.json.JSONTokener;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeAccessibilityInstrumentedTest {

    private static final long SHORT_TIMEOUT = 5_000;
    private static final long PAGE_TIMEOUT = 60_000;

    private Instrumentation instrumentation;
    private UiAutomation automation;
    private UiDevice device;
    private String originalAccessibilityEnabled;
    private String originalAccessibilityServices;
    private String originalFontScale;

    @Before
    public void setUp() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        automation = instrumentation.getUiAutomation();
        device = UiDevice.getInstance(instrumentation);
        originalAccessibilityEnabled =
            device.executeShellCommand("settings get secure accessibility_enabled").trim();
        originalAccessibilityServices =
            device.executeShellCommand("settings get secure enabled_accessibility_services").trim();
        originalFontScale = device.executeShellCommand("settings get system font_scale").trim();
        disableAccessibilityServices();
        instrumentation.runOnMainSync(() -> WebStorage.getInstance().deleteAllData());

        // Målpakken følger flavoren (no.kaupet.app.staging for staging), så den
        // leses fra appen under test i stedet for å hardkodes.
        Context context = instrumentation.getTargetContext();
        Intent launchIntent =
            context.getPackageManager().getLaunchIntentForPackage(context.getPackageName());
        assertNotNull("Staging app must have a launcher activity", launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(launchIntent);
    }

    @After
    public void tearDown() throws Exception {
        device.executeShellCommand("settings put system font_scale " + ("null".equals(originalFontScale) ? "1.0" : originalFontScale));
        restoreSecureSetting("enabled_accessibility_services", originalAccessibilityServices);
        restoreSecureSetting("accessibility_enabled", originalAccessibilityEnabled);
    }

    @Test
    public void stagingWebViewExposesSemanticsAndHandlesKeyboardAndSystemBack() throws Exception {
        connectStagingShellToLocalServer();
        completeOnboarding();

        assertNamedControl("Søk i annonser");
        assertNamedControl("Velg lokasjon: Hele Norge");
        assertNamedControl("Kategorier");
        assertNamedControl("Hjem");
        assertNamedControl("Søk");
        assertNamedControl("Ny annonse");

        focusInputNode("Velg lokasjon: Hele Norge");
        device.pressKeyCode(KeyEvent.KEYCODE_ENTER);
        assertSearchPanel();
        device.pressKeyCode(KeyEvent.KEYCODE_ESCAPE);
        assertTrue("Escape must close the search panel", waitUntilSearchPanelClosed());
        assertInputFocus("Velg lokasjon: Hele Norge");

        device.pressKeyCode(KeyEvent.KEYCODE_ENTER);
        assertSearchPanel();
        device.pressBack();
        assertTrue("Android system back must close the search panel", waitUntilSearchPanelClosed());
        assertInputFocus("Velg lokasjon: Hele Norge");

        AccessibilityNodeInfo root = automation.getRootInActiveWindow();
        assertNotNull("WebView accessibility root must remain available after close", root);
        assertNull(
            "Instrumentation deliberately does not force native accessibility focus; " +
            "TalkBack focus at the WebView boundary remains a separate manual observation",
            root.findFocus(AccessibilityNodeInfo.FOCUS_ACCESSIBILITY)
        );
    }

    // KG-39-F02: ekte OS-endring må skalere tekst, men beholde rotmål og sidebredde.
    @Test
    public void androidFontScaleChangesTextWithoutScalingRootLayout() throws Exception {
        device.executeShellCommand("settings put system font_scale 1.0");
        connectStagingShellToLocalServer();
        completeOnboarding();
        JSONObject baseline = readLayoutMetrics();
        assertEquals(1.0, baseline.getDouble("scale"), 0.01);

        device.executeShellCommand("settings put system font_scale 2.0");
        assertTrue("WebView must apply the new OS text scale", waitForCondition(() -> {
            try { return readLayoutMetrics().getDouble("scale") == 2.0; }
            catch (Exception notReady) { return false; }
        }, PAGE_TIMEOUT));
        assertNamedControl("Hjem");
        assertNamedControl("Ny annonse");
        JSONObject enlarged = readLayoutMetrics();
        assertEquals("Root spacing must stay unchanged", baseline.getDouble("root"), enlarged.getDouble("root"), 0.01);
        assertEquals("Visible location text must double", baseline.getDouble("text") * 2, enlarged.getDouble("text"), 0.1);
        assertTrue("Landing page must fit horizontally at 200%", enlarged.getInt("scrollWidth") <= enlarged.getInt("width"));
        System.out.println("font-scale baseline=" + baseline + " enlarged=" + enlarged);
        File screenshot = new File(instrumentation.getTargetContext().getCacheDir(), "fontscale-200.png");
        try (FileOutputStream out = new FileOutputStream(screenshot)) {
            automation.takeScreenshot().compress(Bitmap.CompressFormat.PNG, 100, out);
        }
    }

    private JSONObject readLayoutMetrics() throws Exception {
        CountDownLatch ready = new CountDownLatch(1);
        String[] result = { null };
        instrumentation.runOnMainSync(() -> {
            for (android.app.Activity activity : ActivityLifecycleMonitorRegistry.getInstance().getActivitiesInStage(Stage.RESUMED)) {
                if (!(activity instanceof MainActivity)) continue;
                ((MainActivity) activity).getBridge().getWebView().evaluateJavascript("""
                    JSON.stringify({
                        scale: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--kaupet-text-scale')) || 1,
                        root: parseFloat(getComputedStyle(document.documentElement).fontSize),
                        text: parseFloat(getComputedStyle(document.querySelector('[aria-label="Velg lokasjon: Hele Norge"]').lastElementChild).fontSize),
                        width: document.documentElement.clientWidth,
                        scrollWidth: document.documentElement.scrollWidth
                    })
                    """, value -> { result[0] = value; ready.countDown(); });
            }
        });
        if (!ready.await(SHORT_TIMEOUT, TimeUnit.MILLISECONDS)) throw new IllegalStateException("WebView metrics unavailable");
        return new JSONObject((String) new JSONTokener(result[0]).nextValue());
    }

    private void assertSearchPanel() {
        assertNamedControl("Søk og filtrer");
        assertNamedControl("Søk etter sted");
        assertNamedControl("Bruk min posisjon");
    }

    private void connectStagingShellToLocalServer() {
        UiObject2 heading = waitFor(By.text("Velg server"), PAGE_TIMEOUT);
        assertNotNull("Staging server selector must load", heading);

        UiObject2 address = waitFor(By.clazz("android.widget.EditText"), SHORT_TIMEOUT);
        assertNotNull("Local server address field must be exposed", address);
        address.setText("localhost:3000");

        UiObject2 connect = waitFor(By.text("Koble til lokal server"), SHORT_TIMEOUT);
        assertNotNull("Local server action must be exposed", connect);
        connect.click();
    }

    private void completeOnboarding() {
        UiObject2 start = waitForNamedControl("Kom i gang", PAGE_TIMEOUT);
        assertNotNull("Onboarding must load from localhost:3000", start);
        start.click();
        UiObject2 skip = waitForNamedControl("Hopp over", SHORT_TIMEOUT);
        assertNotNull("Sign-in step must offer skipping", skip);
        assertTrue("Skip must become enabled after auth bootstrap", waitForCondition(() -> {
            AccessibilityNodeInfo node = findNodeByName(automation.getRootInActiveWindow(), "Hopp over");
            return node != null && node.isEnabled();
        }, SHORT_TIMEOUT));
        focusInputNode("Hopp over");
        device.pressKeyCode(KeyEvent.KEYCODE_ENTER);

        // Avslutningsanimasjonen går automatisk videre; vent på den stabile målsiden.
        assertNotNull(
            "Native landing page must load after onboarding",
            waitForNamedControl("Velg lokasjon: Hele Norge", PAGE_TIMEOUT)
        );
    }

    private void assertLocationDialog() {
        assertNotNull("Named location dialog must open", waitForNamedControl("Velg sted", SHORT_TIMEOUT));
        assertNamedControl("Søk etter sted");
        assertNamedControl("Bruk min posisjon");
        assertNamedControl("Lukk");
    }

    private void assertNamedControl(String name) {
        UiObject2 node = waitForNamedControl(name, SHORT_TIMEOUT);
        if (node != null) {
            assertTrue("\"" + name + "\" must be enabled", node.isEnabled());
            return;
        }
        // UiAutomator-selektorene ser ikke supplementalDescription/containerTitle (se nodeHasName).
        AccessibilityNodeInfo[] found = { null };
        waitForCondition(
            () -> (found[0] = findNodeByName(automation.getRootInActiveWindow(), name)) != null,
            SHORT_TIMEOUT
        );
        assertNotNull("Accessibility tree must expose \"" + name + "\"", found[0]);
        assertTrue("\"" + name + "\" must be enabled", found[0].isEnabled());
    }

    private UiObject2 waitForNamedControl(String name, long timeout) {
        UiObject2[] found = { null };
        waitForCondition(() -> {
            found[0] = device.findObject(By.hintContains(name));
            if (found[0] == null) found[0] = device.findObject(By.descContains(name));
            if (found[0] == null) found[0] = device.findObject(By.textContains(name));
            return found[0] != null;
        }, timeout);
        return found[0];
    }

    private UiObject2 waitFor(androidx.test.uiautomator.BySelector selector, long timeout) {
        return device.wait(Until.findObject(selector), timeout);
    }

    private void focusInputNode(String name) {
        AccessibilityNodeInfo node = findNodeByName(automation.getRootInActiveWindow(), name);
        assertNotNull("Input-focus target must exist: " + name, node);
        assertTrue("WebView must accept DOM input focus for: " + name, node.performAction(AccessibilityNodeInfo.ACTION_FOCUS));
        assertInputFocus(name);
    }

    private void assertInputFocus(String expectedName) {
        assertTrue(
            "DOM/input focus must return to \"" + expectedName + "\"",
            waitForCondition(
                () -> {
                    AccessibilityNodeInfo root = automation.getRootInActiveWindow();
                    AccessibilityNodeInfo focused =
                        root == null ? null : root.findFocus(AccessibilityNodeInfo.FOCUS_INPUT);
                    return focused != null && nodeHasName(focused, expectedName);
                },
                SHORT_TIMEOUT
            )
        );
    }

    private boolean waitUntilSearchPanelClosed() {
        return waitForCondition(
            () -> findNodeByName(automation.getRootInActiveWindow(), "Søk og filtrer") == null,
            SHORT_TIMEOUT
        );
    }

    private static AccessibilityNodeInfo findNodeByName(AccessibilityNodeInfo node, String name) {
        if (node == null) return null;
        if (nodeHasName(node, name)) return node;
        for (int index = 0; index < node.getChildCount(); index++) {
            AccessibilityNodeInfo match = findNodeByName(node.getChild(index), name);
            if (match != null) return match;
        }
        return null;
    }

    // WebView på Android 16+ legger navnet til redigerbare felt i
    // supplementalDescription og navnet til grupper i containerTitle, ikke i
    // text/contentDescription/hint (KG-39-F01). TalkBack leser begge.
    private static boolean nodeHasName(AccessibilityNodeInfo node, String name) {
        return name.equals(String.valueOf(node.getText())) ||
            name.equals(String.valueOf(node.getContentDescription())) ||
            (Build.VERSION.SDK_INT >= 36 && (
                name.equals(String.valueOf(node.getSupplementalDescription())) ||
                name.equals(String.valueOf(node.getContainerTitle()))));
    }

    private static boolean waitForCondition(BooleanSupplier condition, long timeout) {
        long deadline = System.currentTimeMillis() + timeout;
        do {
            if (condition.getAsBoolean()) return true;
            try {
                Thread.sleep(100);
            } catch (InterruptedException error) {
                Thread.currentThread().interrupt();
                return false;
            }
        } while (System.currentTimeMillis() < deadline);
        return false;
    }

    private void disableAccessibilityServices() throws Exception {
        device.executeShellCommand("settings delete secure enabled_accessibility_services");
        device.executeShellCommand("settings put secure accessibility_enabled 0");
    }

    private void restoreSecureSetting(String key, String value) throws Exception {
        if (value.isEmpty() || "null".equals(value)) {
            device.executeShellCommand("settings delete secure " + key);
        } else {
            device.executeShellCommand("settings put secure " + key + " " + value);
        }
    }
}
