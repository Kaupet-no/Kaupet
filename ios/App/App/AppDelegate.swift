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
        bridge?.registerPluginInstance(ServerTargetPlugin())

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
#endif
    }

    override func instanceDescriptor() -> InstanceDescriptor {
        let descriptor = super.instanceDescriptor()
        guard descriptor.serverURL == nil,
              let target = ServerTargetPlugin.storedURL()
        else { return descriptor }
        descriptor.serverURL = target
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
            let appURL = bridge?.config.serverURL,
            !Self.hasSameOrigin(loadedURL, appURL)
        else { return }

        hideSplashScreen()
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
        injectFCMToken(token)
    }

    // Inject the FCM token into the WebView so JS can pick it up.
    private func injectFCMToken(_ token: String) {
        let safe = token.replacingOccurrences(of: "\\", with: "\\\\")
                        .replacingOccurrences(of: "'", with: "\\'")
        let js = "window.__kaupetFCMToken='\(safe)';" +
                 "window.dispatchEvent(new CustomEvent('kaupet:fcmToken',{detail:'\(safe)'}));"
        DispatchQueue.main.async {
            if let vc = self.window?.rootViewController as? CAPBridgeViewController {
                vc.bridge?.webView?.evaluateJavaScript(js, completionHandler: nil)
            }
        }
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
