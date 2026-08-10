import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate, MessagingDelegate {

    var window: UIWindow?

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
