import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { lazy, Suspense, useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import interVariableFontUrl from "@fontsource-variable/inter/files/inter-latin-wght-normal.woff2?url";
import { SiteHeader } from "@/components/site-header";
import { ModerationBanner } from "@/components/moderation-banner";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/lib/auth";
import { getSessionUser } from "@/lib/current-user.functions";
import { flushAuthCookies } from "@/lib/native-cookies";
import { clearMessageAttachmentUrlCache } from "@/lib/storage";
import { ThemeProvider } from "@/hooks/use-theme";
import { initOfflineWatcher } from "@/lib/native-offline";
import {
  autoRestoreNativePush,
  initNativePushForeground,
  initNativePushNavigation,
} from "@/lib/native-push";
import { setupNative } from "@/lib/native-setup";
import { initUniversalLinkNavigation, hideNativeBootSplash } from "@/lib/native";
import { useIsNative } from "@/hooks/use-is-native";
import { useKeyboardVisible } from "@/hooks/use-keyboard-visible";
import { SearchPanelProvider } from "@/features/listing-search/search-panel/search-panel-context";
import { FeedbackTag } from "@/components/feedback-tag";
import { TestEnvBanner } from "@/components/test-env-banner";
import { TestEnvGate } from "@/components/test-env-gate";
import { useIsTestEnv } from "@/lib/env";
import { isComposerRoute, isFocusedRoute } from "@/features/listing-creation/chrome-routes";

// Lat-lastet: native-only bunnavigasjon (drar med seg ResponsiveOverlay) skal
// ikke tynge rotsettet for webbrukere som aldri rendrer den.
const AppBottomNav = lazy(() =>
  import("@/components/app-bottom-nav").then((m) => ({ default: m.AppBottomNav })),
);
// Lat-lastet: ingen toast vises i første maling. Sonner replayer aktive
// toasts til `Toaster` når den abonnerer, selv om de ble trigget før den
// rakk å laste (se `Observer.subscribe` i sonner), så ingenting går tapt.
const Toaster = lazy(() => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })));

// Prøver å hente ut origin fra en env-variabel til et preconnect-hint. Skal
// aldri kaste under SSR — hopper heller over hintet hvis variabelen mangler
// eller ikke er en gyldig URL.
function safeOrigin(url: string | undefined): string | undefined {
  if (!url) return undefined;
  try {
    return new URL(url).origin;
  } catch {
    return undefined;
  }
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="font-display text-7xl text-primary">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Siden finnes ikke</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Vi fant ikke det du leter etter. Den kan ha blitt fjernet eller flyttet.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:opacity-90"
          >
            Til forsiden
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Noe gikk galt</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Vi klarte ikke å laste siden. Prøv på nytt eller gå tilbake til forsiden.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
          >
            Prøv på nytt
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent/10"
          >
            Til forsiden
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  // Leser sesjonen fra kapselen på serveren, slik at headeren kan rendres med
  // riktig auth-tilstand ved første maling i stedet for et skjelett. På
  // klienten lar vi AuthProvider finne sesjonen selv (den er lokal og
  // umiddelbar) — da slipper vi et RPC-hopp per navigasjon.
  loader: async () => ({
    ssrUser: typeof window === "undefined" ? await getSessionUser() : undefined,
  }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1, viewport-fit=cover",
      },
      { title: "Kaupet.no — Gi tingene dine et nytt liv" },
      {
        name: "description",
        content:
          "Kaupet.no er en åpen kildekode-markedsplass for kjøp og salg av brukte ting i Norge. Bygget av frivillige, for fellesskapet.",
      },
      { name: "author", content: "Kaupet.no" },
      // Synlig i view-source på hver SSR-side, og AGPL §13-kildehenvisningen.
      {
        name: "generator",
        content:
          "Powered by Kaupet.no — https://kaupet.no (AGPL-3.0, https://github.com/Kaupet-no/Kaupet)",
      },
      { property: "og:site_name", content: "Kaupet.no" },
      { property: "og:locale", content: "nb_NO" },
      { property: "og:type", content: "website" },
      { property: "og:title", content: "Kaupet.no — Gi tingene dine et nytt liv" },
      {
        property: "og:description",
        content: "Kjøp og selg brukte ting lokalt. Åpen kildekode, drevet av fellesskapet.",
      },
      { property: "og:url", content: "https://kaupet.no/" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "Kaupet.no — Gi tingene dine et nytt liv" },
      {
        name: "twitter:description",
        content: "Kjøp og selg brukte ting lokalt. Åpen kildekode, drevet av fellesskapet.",
      },
      {
        name: "description",
        content:
          "Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame.",
      },
      {
        property: "og:description",
        content:
          "Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame.",
      },
      {
        name: "twitter:description",
        content:
          "Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame.",
      },
      {
        property: "og:image",
        content: "https://kaupet.no/og-image.png",
      },
      {
        name: "twitter:image",
        content: "https://kaupet.no/og-image.png",
      },
    ],
    links: [
      // Preconnect sparer en DNS+TLS-rundtur før det første bilde-/datakallet,
      // og preload av brødtekstfonten (Inter) fjerner FOUT-forsinkelsen ved
      // første maling.
      ...(safeOrigin(import.meta.env.VITE_SUPABASE_URL)
        ? [
            {
              rel: "preconnect",
              href: safeOrigin(import.meta.env.VITE_SUPABASE_URL),
              crossOrigin: "anonymous" as const,
            },
          ]
        : []),
      ...(safeOrigin(import.meta.env.VITE_R2_PUBLIC_BASE_URL)
        ? [{ rel: "preconnect", href: safeOrigin(import.meta.env.VITE_R2_PUBLIC_BASE_URL) }]
        : []),
      {
        rel: "preload",
        href: interVariableFontUrl,
        as: "font",
        type: "font/woff2",
        crossOrigin: "anonymous",
      },
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],

    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://kaupet.no/#organization",
              name: "Kaupet.no",
              url: "https://kaupet.no/",
              description:
                "Norsk åpen kildekode-markedsplass for brukte ting mellom privatpersoner.",
            },
            {
              "@type": "WebSite",
              "@id": "https://kaupet.no/#website",
              url: "https://kaupet.no/",
              name: "Kaupet.no",
              inLanguage: "nb-NO",
              publisher: { "@id": "https://kaupet.no/#organization" },
              potentialAction: {
                "@type": "SearchAction",
                target: "https://kaupet.no/annonser?q={search_term_string}",
                "query-input": "required name=search_term_string",
              },
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="nb" suppressHydrationWarning>
      <head>
        <HeadContent />
        {/* Runs synchronously during parsing, before anything paints (native-boot
            class detection + dark-mode-flash prevention). Moved to a static,
            same-origin file so it runs under the CSP's script-src 'self' without
            needing 'unsafe-inline' or a maintained hash — see public/boot.js. */}
        <script src="/boot.js" />
      </head>
      <body>
        {/* Same background/logo as capacitor.config.ts SplashScreen + the
            iOS/Android launch images — this picks up right where the native
            splash leaves off and stays until the native layout has actually
            painted (see useIsNative / hideNativeBootSplash). */}
        <div id="native-boot-splash">
          <div className="native-boot-icon" aria-hidden="true" />
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const { ssrUser } = Route.useLoaderData();
  const router = useRouter();

  useEffect(() => {
    document.documentElement.dataset.kaupetHydrated = "true";
    return () => {
      delete document.documentElement.dataset.kaupetHydrated;
    };
  }, []);

  useEffect(() => {
    // Only invalidate on real sign-in / sign-out — NOT on INITIAL_SESSION or
    // TOKEN_REFRESHED, which fire on every mount/tab-focus and would refetch
    // every query in the app, causing the UI to feel slow and unstable.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      // Sesjonskapselen er nettopp skrevet, fornyet eller slettet. På Android
      // ligger den bare i minnet til WebViewen flusher, og onPause kjører
      // ikke hvis prosessen dør i forgrunnen — da mistet vi en fersk
      // innlogging, og en utlogging festet seg ikke. Se native-cookies.ts.
      // INITIAL_SESSION endrer ingenting og trenger ingen flush.
      if (event !== "INITIAL_SESSION") void flushAuthCookies();

      if (event === "SIGNED_OUT") clearMessageAttachmentUrlCache();
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        queryClient.invalidateQueries();
      }
      if (event === "SIGNED_IN") {
        // Onboarding can grant OS permission before the user signs in. Retry
        // the account-bound subscription now without showing another prompt.
        void autoRestoreNativePush();
        // Cancel pending account deletion if the user signs back in
        void (async () => {
          try {
            const { data } = await supabase.rpc("cancel_account_deletion");
            if (data === true) {
              const { showSuccessToast } = await import("@/lib/toast");
              showSuccessToast("Velkommen tilbake! Slettingen av kontoen din er avbrutt.");
            }
          } catch {
            // ignore
          }
        })();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);

  useEffect(() => {
    const cleanup = initOfflineWatcher();
    void setupNative();
    void autoRestoreNativePush();
    void initNativePushNavigation((url) => router.navigate({ href: url }));
    void initNativePushForeground((url) => router.navigate({ href: url }));
    void initUniversalLinkNavigation((url) => router.navigate({ href: url }));
    return cleanup;
  }, [router]);

  const native = useIsNative();

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AuthProvider initialUser={ssrUser}>
          <RootBody native={native} />
          <Suspense fallback={null}>
            <Toaster />
          </Suspense>
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootBody({ native }: { native: boolean }) {
  const isTest = useIsTestEnv();
  const keyboardVisible = useKeyboardVisible();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const composerRoute = isComposerRoute(pathname);
  const bottomNavHidden = composerRoute || isFocusedRoute(pathname);

  useEffect(() => {
    // Runs after the browser has painted this render — by the time we get
    // here the native-layout DOM (bottom nav etc.) is already on screen, so
    // removing the overlay now never re-exposes the web-layout flash
    // (useIsNative leser plattformen allerede i første render). Kalles
    // ubetinget: finnes overlayet uten at vi er native — boot.js' dev-flagg
    // mot et miljø der isNative() er strippet — skal det også vekk her, ikke
    // bli stående for alltid.
    hideNativeBootSplash();
  }, []);

  useEffect(() => {
    if (!isTest) return;
    const original = document.title;
    if (!original.startsWith("[TEST]")) {
      document.title = `[TEST] ${original}`;
    }
    let meta = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "robots";
      document.head.appendChild(meta);
    }
    const prevContent = meta.content;
    meta.content = "noindex, nofollow";
    return () => {
      document.title = original;
      if (created) meta?.remove();
      else if (meta) meta.content = prevContent;
    };
  }, [isTest]);

  const body = (
    <div
      className={`flex min-h-screen flex-col bg-background${composerRoute ? " composer-route" : ""}`}
    >
      {!native && (
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:text-primary-foreground"
        >
          Hopp til innhold
        </a>
      )}
      {isTest && <TestEnvBanner />}
      {!native && <SiteHeader />}
      <ModerationBanner />
      <main
        id="main-content"
        className={`flex-1${native && !keyboardVisible && !bottomNavHidden ? " pb-bottom-nav" : ""}`}
      >
        <Outlet />
      </main>

      {!native && (
        <footer className="border-t border-border bg-surface">
          <div className="mx-auto max-w-6xl px-4 py-8 text-sm text-muted-foreground">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-1">
                <p>
                  © {new Date().getFullYear()} Kaupet.no — Bygges som åpen kildekode,{" "}
                  <a
                    href="https://www.gnu.org/licenses/agpl-3.0.html"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline hover:text-foreground transition-colors"
                  >
                    AGPL-3.0
                  </a>
                  .
                </p>
                <p>
                  Ved å bruke Kaupet.no godtar du våre{" "}
                  <Link to="/vilkar" className="underline hover:text-foreground transition-colors">
                    brukervilkår
                  </Link>
                  .
                </p>
              </div>
              <div className="space-y-1 sm:max-w-xl sm:text-right">
                <p>
                  Ditt personvern på internett er viktig. Kaupet.no benytter derfor ingen sporende
                  informasjonskapsler eller tredjeparts analyseverktøy. Les vår{" "}
                  <Link
                    to="/personvern"
                    className="underline hover:text-foreground transition-colors"
                  >
                    personvernerklæring her
                  </Link>
                  .
                </p>
              </div>
            </div>
          </div>
        </footer>
      )}
      {native && !bottomNavHidden && (
        <Suspense fallback={null}>
          <AppBottomNav hidden={keyboardVisible} />
        </Suspense>
      )}
      <FeedbackTag />
    </div>
  );

  // Panelet lever over rutene (fase 12) — bunnavigasjonens «Søk»-fane åpner
  // det direkte i stedet for å navigere til en side som mounter sin egen
  // instans. Montert uansett plattform (ikke bare `native`): /annonser og
  // søsknene deler komponent mellom web og native og kaller
  // `useRegisterSearchPanelResults` ubetinget, så providerens context må
  // finnes uansett — web bruker den bare aldri (ingen bunnavigasjon der).
  const content = <SearchPanelProvider>{body}</SearchPanelProvider>;

  return isTest ? <TestEnvGate>{content}</TestEnvGate> : content;
}
