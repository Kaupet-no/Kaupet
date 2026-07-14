# Kaupet som native app (Capacitor)

Kaupet er pakket som en hybrid native app for iOS og Android med
[Capacitor](https://capacitorjs.com/). Appen er et tynt skall rundt en
WebView som laster `https://kaupet.no`. Hvis serveren ikke kan nås vises
en innebygd offline-side (`capacitor-shell/offline.html`).

## Arkitektur

```
┌──────────────────────────────────┐
│  Native app (iOS / Android)      │
│  ┌────────────────────────────┐  │
│  │  WebView → kaupet.no       │  │
│  │  Ved feil → offline.html   │  │
│  └────────────────────────────┘  │
│  Plugins: Camera, Geolocation,   │
│           Share, Browser, App    │
└──────────────────────────────────┘
```

## Hva er med i POC

- iOS- og Android-prosjekt generert med Capacitor
- App-ikon og splash (Kaupet-merkevare)
- Innebygd visuell offline-side med "Prøv igjen"-knapp
- Toast-varsel ved nettverkstap mens appen kjører
- Native kamera/galleri i bildevelgeren
- Native GPS-posisjon i lokasjonsfilteret
- Native delefunksjon på annonsesider
- Android: hardware tilbake-knapp navigerer i WebView-historikken
- Custom URL scheme `no.kaupet.app://` (forberedt, ikke aktivt brukt)

## Ikke med i POC

- Publisering i App Store / Google Play
- Universal Links / App Links
- Google OAuth-login i appen (bruk e-post + passord)

## Native push-varsler (Android og iOS / FCM)

Begge native apper bruker `@capacitor/push-notifications` + Firebase Cloud
Messaging, som et tillegg til det eksisterende web push-systemet (samme
fire varslingstyper: meldinger, lagrede søk, prisfall, solgt). iOS ruter
via FCM → APNs; koden er identisk for begge plattformer. Token lagres i
`public.push_subscriptions` (med `platform = 'android'` eller `'ios'`), og
dispatch skjer fra `src/lib/fcm.server.ts`.

### Android

For at dette skal virke i en build trengs:

1. Et Firebase-prosjekt koblet til app-IDen `no.kaupet.app`.
2. `google-services.json` fra Firebase Console lagt i `android/app/`
   (plukkes automatisk opp av `android/app/build.gradle` — ikke commit denne
   filen, den er miljøspesifikk).
3. En service account-nøkkel (Project Settings → Service Accounts →
   Generate new private key) satt som `FCM_SERVICE_ACCOUNT_JSON` i server-
   miljøet (se `.env.example`).

Uten `google-services.json` bygger appen fortsatt fint, men Google
Services-pluginet aktiveres ikke og native push vil ikke fungere på enheten.

### iOS

1. I Firebase Console: legg til en iOS-app med bundle ID `no.kaupet.app`
   (Project settings → Add app → Apple).
2. Last ned `GoogleService-Info.plist` og legg den i `ios/App/App/` (ikke
   commit — den er miljøspesifikk).
3. Last opp APNs Auth Key til Firebase: Project settings → Cloud Messaging
   → Apple app configuration → APNs Authentication Key.
   - Nøkkelen opprettes i Apple Developer Console under
     Certificates, Identifiers & Profiles → Keys (type: Apple Push
     Notifications service (APNs)).
4. I Xcode: åpne `ios/App/App.xcodeproj`, velg `App`-target →
   Signing & Capabilities → `+ Capability` → legg til
   **Push Notifications**.
5. Kjør `bunx cap sync ios` så Capacitor plukker opp `GoogleService-Info.plist`.

Etter dette fungerer push-varsler på iOS på nøyaktig samme måte som Android.

---

## Bygg og kjør Android (Windows)

### Førstegangs oppsett

1. Installer [Android Studio](https://developer.android.com/studio)
   (inkluderer Android SDK).
2. Opprett en emulator i Android Studio (Device Manager → Create Device).
3. I prosjektrota:
   ```
   bun install
   bunx cap add android         # kun første gang
   bunx cap sync android
   ```

### Bygg og kjør

```
bunx cap sync android
bunx cap open android
```

Trykk "Run" i Android Studio og velg emulator eller en tilkoblet enhet
med USB-debugging.

### Bygg signert debug-APK for sideload

```
cd android
gradlew.bat assembleDebug
```

APK-en havner i `android/app/build/outputs/apk/debug/app-debug.apk` og
kan installeres med `adb install` eller deles til testere.

---

## Bygg og kjør iOS (macOS)

### Førstegangs oppsett

1. Installer [Xcode](https://apps.apple.com/no/app/xcode/id497799835) fra
   Mac App Store.
2. Installer CocoaPods:
   ```
   sudo gem install cocoapods
   ```
3. Klon prosjektet og kjør:
   ```
   bun install
   bunx cap add ios             # kun første gang
   bunx cap sync ios
   ```

### Bygg og kjør

```
bunx cap sync ios
bunx cap open ios
```

I Xcode:

1. Velg `App` i prosjekt-treet → fanen "Signing & Capabilities"
2. Logg inn med Apple-ID under "Team" (gratis-ID fungerer)
3. Velg iOS Simulator eller koble til en iPhone
4. Trykk play-knappen

> En gratis Apple-ID lar deg installere appen på din egen enhet i 7 dager
> om gangen. Ingen Apple Developer Program ($99/år) trengs for POC.

---

## Oppdater appen etter en kaupet.no-endring

Fordi appen laster `https://kaupet.no` direkte trenger du normalt
**ingenting** å gjøre når web-appen oppdateres — brukerne får siste versjon
neste gang de starter appen.

Du trenger kun å bygge og distribuere ny app-versjon når:

- Capacitor-konfigurasjonen endres (`capacitor.config.ts`)
- Offline-siden endres (`capacitor-shell/offline.html`)
- Native plugins legges til eller fjernes
- App-ikon eller splash endres

Etter en slik endring:

```
bunx cap sync
```

… og bygg på nytt i Xcode / Android Studio.

---

## App-ikon og splash screen

Master-grafikken ligger i `resources/`:

- `resources/icon-only.png` — 1024×1024 app-ikon (grønn bakgrunn + `k.`-logo)
- `resources/splash.png` — 2732×2732 splash for lys modus
- `resources/splash-dark.png` — 2732×2732 splash for mørk modus

Etter endring av disse, regenerer alle native-størrelser:

```
bun run generate:assets
bunx cap sync
```

Dette produserer automatisk:

- **iOS**: `ios/App/App/Assets.xcassets/AppIcon.appiconset/` + `Splash.imageset/`
- **Android**: `android/app/src/main/res/mipmap-*/` (adaptive ikoner) +
  `drawable-*/splash.png`

Fargene som brukes matcher merkevaren på `kaupet.no`:

| Token      | Hex       | Bruk                               |
| ---------- | --------- | ---------------------------------- |
| Primary    | `#2f5d44` | Bokstaven `k`, ikon-bakgrunn       |
| Accent     | `#d97a3c` | Punktum `.` i logoen               |
| Cream      | `#fbf9f3` | Splash-bakgrunn (lys), `k` på ikon |
| Dark green | `#1d2a22` | Splash-bakgrunn (mørk modus)       |

---

## Vanlige feil

**Android: `SDK location not found`**
Lag `android/local.properties` med innholdet:

```
sdk.dir=C\:\\Users\\<brukernavn>\\AppData\\Local\\Android\\Sdk
```

**iOS: `pod install` feiler**
Kjør `cd ios/App && pod install --repo-update`.

**Build feiler etter ny plugin lagt til**
Kjør `bunx cap sync` på nytt så Capacitor regenererer native-prosjektene.

**WebView viser blank skjerm**
Sjekk at `https://kaupet.no` er oppe. Hvis offline-siden vises i stedet
fungerer feilhåndteringen som forventet.
