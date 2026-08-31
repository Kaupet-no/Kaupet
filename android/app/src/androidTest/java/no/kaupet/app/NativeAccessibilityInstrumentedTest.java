package no.kaupet.app;

import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Instrumentation;
import android.app.UiAutomation;
import android.content.Context;
import android.content.Intent;
import android.view.KeyEvent;
import android.view.accessibility.AccessibilityNodeInfo;
import android.webkit.WebStorage;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import androidx.test.uiautomator.By;
import androidx.test.uiautomator.UiDevice;
import androidx.test.uiautomator.UiObject2;
import androidx.test.uiautomator.Until;
import java.util.function.BooleanSupplier;
import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeAccessibilityInstrumentedTest {

    private static final String APP_PACKAGE = "no.kaupet.app";
    private static final long SHORT_TIMEOUT = 5_000;
    private static final long PAGE_TIMEOUT = 60_000;

    private Instrumentation instrumentation;
    private UiAutomation automation;
    private UiDevice device;
    private String originalAccessibilityEnabled;
    private String originalAccessibilityServices;

    @Before
    public void setUp() throws Exception {
        instrumentation = InstrumentationRegistry.getInstrumentation();
        automation = instrumentation.getUiAutomation();
        device = UiDevice.getInstance(instrumentation);
        originalAccessibilityEnabled =
            device.executeShellCommand("settings get secure accessibility_enabled").trim();
        originalAccessibilityServices =
            device.executeShellCommand("settings get secure enabled_accessibility_services").trim();
        disableAccessibilityServices();
        instrumentation.runOnMainSync(() -> WebStorage.getInstance().deleteAllData());

        Context context = instrumentation.getTargetContext();
        Intent launchIntent = context.getPackageManager().getLaunchIntentForPackage(APP_PACKAGE);
        assertNotNull("Staging app must have a launcher activity", launchIntent);
        launchIntent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TASK | Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(launchIntent);
    }

    @After
    public void tearDown() throws Exception {
        restoreSecureSetting("enabled_accessibility_services", originalAccessibilityServices);
        restoreSecureSetting("accessibility_enabled", originalAccessibilityEnabled);
    }

    @Test
    public void stagingWebViewExposesSemanticsAndHandlesKeyboardAndSystemBack() throws Exception {
        connectStagingShellToLocalServer();
        completeOnboarding();

        assertNamedControl("Søk i annonser");
        assertNamedControl("Velg lokasjon: Hele Norge");
        assertNamedControl("Alle kategorier");
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
        UiObject2 explore = waitFor(By.text("Utforsk Kaupet"), PAGE_TIMEOUT);
        assertNotNull("Onboarding must load from localhost:3000", explore);
        explore.click();

        UiObject2 continueButton = waitForNamedControl("Fortsett til Kaupet", SHORT_TIMEOUT);
        assertNotNull("Onboarding continuation must be exposed", continueButton);
        continueButton.click();

        assertNotNull(
            "Native landing page must load after onboarding",
            waitForNamedControl("Velg lokasjon: Hvor som helst", PAGE_TIMEOUT)
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
        assertNotNull("Accessibility tree must expose \"" + name + "\"", node);
        assertTrue("\"" + name + "\" must be enabled", node.isEnabled());
    }

    private UiObject2 waitForNamedControl(String name, long timeout) {
        long attemptTimeout = timeout / 3;
        UiObject2 node = waitFor(By.hintContains(name), attemptTimeout);
        if (node == null) node = waitFor(By.descContains(name), attemptTimeout);
        return node != null ? node : waitFor(By.textContains(name), attemptTimeout);
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

    private static boolean nodeHasName(AccessibilityNodeInfo node, String name) {
        return name.equals(String.valueOf(node.getText())) ||
            name.equals(String.valueOf(node.getContentDescription()));
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
