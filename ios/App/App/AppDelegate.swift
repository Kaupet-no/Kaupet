import UIKit
import WebKit
import Capacitor
import SplashScreenPlugin
import FirebaseCore
import FirebaseMessaging

final class ServerTargetPlugin: CAPPlugin, CAPBridgedPlugin {
    let identifier = "ServerTarget"
    let jsName = "ServerTarget"
    let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "set", returnType: CAPPluginReturnPromise)!
    ]

    private static let urlKey = "server_target.url"

    @objc func set(_ call: CAPPluginCall) {
        let requested = call.getString("url")
        let resolved: String?
        if let requested, !requested.isEmpty {
            guard let validated = Self.validate(requested) else {
                call.reject("Ugyldig servermål")
                return
            }
            resolved = validated
        } else {
            resolved = nil
        }

        let defaults = UserDefaults.standard
        if let resolved {
            defaults.set(resolved, forKey: Self.urlKey)
        } else {
            defaults.removeObject(forKey: Self.urlKey)
        }
        call.resolve()

        // The next bridge must be created with the selected origin, not by
        // redirecting the existing WebView after Capacitor has injected its
        // origin-scoped plugins.
        DispatchQueue.main.async {
            (UIApplication.shared.delegate as? AppDelegate)?.reloadBridge()
        }
    }

    static func storedURL() -> String? {
        UserDefaults.standard.string(forKey: urlKey)
    }

    static func clearStoredURL() {
        UserDefaults.standard.removeObject(forKey: urlKey)
    }

    private static func validate(_ value: String) -> String? {
        guard let components = URLComponents(string: value),
              let scheme = components.scheme?.lowercased(),
              let host = components.host?.lowercased(),
              components.user == nil,
              components.password == nil
        else { return nil }

        if scheme == "https", host == "staging.kaupet.no" {
            return "https://staging.kaupet.no"
        }
        guard scheme == "http", let port = components.port, (1...65535).contains(port) else {
            return nil
        }
        guard host == "localhost" || host == "127.0.0.1" || Self.isPrivateIPv4(host) else {
            return nil
        }
        return "http://\(host):\(port)"
    }

    private static func isPrivateIPv4(_ host: String) -> Bool {
        let parts = host.split(separator: ".", omittingEmptySubsequences: false)
        guard parts.count == 4,
              let a = Int(parts[0]),
              let b = Int(parts[1]),
              let c = Int(parts[2]),
              let d = Int(parts[3]),
              [a, b, c, d].allSatisfy({ (0...255).contains($0) })
        else {
            return false
        }
        return a == 10 || (a == 172 && (16...31).contains(b)) || (a == 192 && b == 168)
    }
}

private final class WeakScriptMessageHandler: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?

    init(delegate: WKScriptMessageHandler) {
        self.delegate = delegate
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

@objc(KaupetBridgeViewController)
final class KaupetBridgeViewController: CAPBridgeViewController, WKScriptMessageHandler {
    private static let documentReadyHandler = "kaupetDocumentReady"
    private var messageHandler: WeakScriptMessageHandler?

    override func capacitorDidLoad() {
        super.capacitorDidLoad()

        // Android's MainActivity gates its equivalent dev-server switch behind
        // isStaging() (package name ending in ".staging"), so it never exists in
        // the production build. iOS has no staging flavor to key off: a single
        // bundle id (no.kaupet.app) and a single Xcode scheme cover both debug
        // and release, so there is no ".staging" package name to check. DEBUG is
        // the equivalent boundary here. Without this gate, JS running on the
        // bridge origin in the shipped App Store build (e.g. an XSS on kaupet.no)
        // could call ServerTarget.set() and repoint every future cold launch at
        // an attacker-chosen origin over cleartext HTTP.
#if DEBUG
        bridge?.registerPluginInstance(ServerTargetPlugin())
#endif

        let handler = WeakScriptMessageHandler(delegate: self)
        messageHandler = handler
        let contentController = webView?.configuration.userContentController
        contentController?.add(handler, name: Self.documentReadyHandler)
        contentController?.addUserScript(WKUserScript(
            source: "window.webkit.messageHandlers.\(Self.documentReadyHandler).postMessage(window.location.href)",
            injectionTime: .atDocumentEnd,
            forMainFrameOnly: true
        ))

        DispatchQueue.main.asyncAfter(deadline: .now() + 15) { [weak self] in
            self?.hideSplashScreen()
        }

#if DEBUG
        assert(Self.hasSameOrigin(URL(string: "https://kaupet.no")!, URL(string: "https://kaupet.no:443/path")!))
        assert(!Self.hasSameOrigin(URL(string: "https://kaupet.no")!, URL(string: "capacitor://localhost/offline")!))
        assert(!Self.hasSameOrigin(URL(string: "https://staging.kaupet.no")!, URL(string: "https://kaupet.cloudflareaccess.com")!))
#endif
    }

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        // Same DEBUG-only boundary as capacitorDidLoad() above (see comment
        // there): a release build must return the untouched descriptor even if
        // a stored server target somehow exists in UserDefaults, since the
        // plugin that could have written it is itself compiled out of Release.
#if DEBUG
        guard descriptor.serverURL == nil,
              let target = ServerTargetPlugin.storedURL()
        else { return descriptor }
        descriptor.serverURL = target
#endif
        return descriptor
    }

    deinit {
        webView?.configuration.userContentController.removeScriptMessageHandler(forName: Self.documentReadyHandler)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard
            message.name == Self.documentReadyHandler,
            let href = message.body as? String,
            let loadedURL = URL(string: href),
            let appURL = bridge?.config.serverURL
        else { return }

        if Self.hasSameOrigin(loadedURL, appURL) {
            (UIApplication.shared.delegate as? AppDelegate)?.injectCachedFCMToken(into: self)
            return
        }

        hideSplashScreen()

#if DEBUG
        // If a server target is stored, instanceDescriptor() above pointed the
        // bridge's serverURL at that remote target, so loadedURL landing on
        // the app's own local origin (bridge?.config.localURL) instead means
        // Capacitor fell back to errorPath (capacitor-shell/offline.html)
        // because the stored target stopped responding. offline.html is
        // served from that local origin, where window.Capacitor is never
        // injected -- Capacitor's plugin-dispatch bridge is scoped to the
        // single origin it was created with (the stored target), the same
        // reason hideSplashScreen() above has to be driven natively instead
        // of over the bridge. So offline.html can never call
        // ServerTarget.set({url: nil}) to clear itself, and the chooser
        // (capacitor-shell/index.html) never loads again either, since it
        // only shows up when NO target is stored. Without this, the only way
        // out of a dead dev server is deleting the app.
        //
        // Clearing the stored target and reloading the bridge here drops the
        // next launch on the chooser, and it cannot loop: once cleared,
        // instanceDescriptor() leaves serverURL as the local origin, so
        // "loadedURL is the local origin" becomes the NORMAL case -- but
        // storedURL() is nil by then, so this block no longer fires.
        //
        // This also fires on a transient network failure against an
        // otherwise valid staging target, bouncing the user back to the
        // chooser. That is a deliberate, acceptable trade for a
        // developer-only mechanism -- do not "fix" it to tell the two cases
        // apart.
        if let localURL = bridge?.config.localURL,
           Self.hasSameOrigin(loadedURL, localURL),
           ServerTargetPlugin.storedURL() != nil {
            ServerTargetPlugin.clearStoredURL()
            (UIApplication.shared.delegate as? AppDelegate)?.reloadBridge()
        }
#endif
    }

    private func hideSplashScreen() {
        guard let splashScreen = bridge?.plugin(withName: "SplashScreen") as? SplashScreenPlugin else { return }
        guard let call = CAPPluginCall(
            callbackId: UUID().uuidString,
            methodName: "hide",
            options: [:],
            success: { _, _ in },
            error: { error in CAPLog.print("Failed to hide splash screen: \(String(describing: error))") }
        ) else { return }
        splashScreen.hide(call)
    }

    fileprivate func injectFCMToken(_ token: String) {
        guard let loadedURL = webView?.url,
              let appURL = bridge?.config.serverURL,
              Self.hasSameOrigin(loadedURL, appURL)
        else { return }

        let safe = token.replacingOccurrences(of: "\\", with: "\\\\")
                        .replacingOccurrences(of: "'", with: "\\'")
        let js = "if(document.readyState!=='loading'){window.__kaupetFCMToken='\(safe)';" +
                 "window.dispatchEvent(new CustomEvent('kaupet:fcmToken',{detail:'\(safe)'}));}"
        webView?.evaluateJavaScript(js, completionHandler: nil)
    }

    private static func hasSameOrigin(_ lhs: URL, _ rhs: URL) -> Bool {
        lhs.scheme?.lowercased() == rhs.scheme?.lowercased()
            && lhs.host?.lowercased() == rhs.host?.lowercased()
            && effectivePort(lhs) == effectivePort(rhs)
    }

    private static func effectivePort(_ url: URL) -> Int? {
        if let port = url.port { return port }
        return url.scheme?.lowercased() == "http" ? 80 : url.scheme?.lowercased() == "https" ? 443 : nil
    }
}

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?
    private var latestFCMToken: String?

    func reloadBridge() {
        guard let window,
              let rootViewController = UIStoryboard(name: "Main", bundle: nil).instantiateInitialViewController()
        else { return }
        window.rootViewController = rootViewController
        window.makeKeyAndVisible()
    }

    func application(_ application: UIApplication, didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        FirebaseApp.configure()
        Messaging.messaging().delegate = self
        return true
    }

    // Forward APNs token to Firebase so it can exchange it for an FCM token.
    // Capacitor handles this callback internally via NotificationCenter — no proxy call needed.
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        Messaging.messaging().apnsToken = deviceToken
    }

    // Called by Firebase when an FCM token is available or refreshed.
    func messaging(_ messaging: Messaging, didReceiveRegistrationToken fcmToken: String?) {
        guard let token = fcmToken else { return }
        DispatchQueue.main.async {
            self.latestFCMToken = token
            if let vc = self.window?.rootViewController as? KaupetBridgeViewController {
                vc.injectFCMToken(token)
            }
        }
    }

    fileprivate func injectCachedFCMToken(into viewController: KaupetBridgeViewController) {
        guard let latestFCMToken else { return }
        viewController.injectFCMToken(latestFCMToken)
    }

    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    // WKWebView har kantsveip-navigasjon av som standard, og Capacitor
    // eksponerer den ikke i capacitor.config.ts. Uten dette har iOS-brukere
    // ingen sveip-tilbake noe sted i appen. Settes her fordi webView-en ikke
    // finnes ennå i didFinishLaunching; kallet er idempotent.
    func applicationDidBecomeActive(_ application: UIApplication) {
        if let vc = window?.rootViewController as? CAPBridgeViewController {
            vc.bridge?.webView?.allowsBackForwardNavigationGestures = true
        }
    }
    func applicationWillTerminate(_ application: UIApplication) {}

    func application(_ app: UIApplication, open url: URL, options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication, continue userActivity: NSUserActivity, restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity, restorationHandler: restorationHandler)
    }
}
