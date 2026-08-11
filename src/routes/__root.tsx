import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { SiteHeader } from "@/components/site-header";
import { ModerationBanner } from "@/components/moderation-banner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { AuthProvider } from "@/lib/auth";
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
import { AppBottomNav } from "@/components/app-bottom-nav";
import { SearchPanelProvider } from "@/features/listing-search/search-panel/search-panel-context";
import { FeedbackTag } from "@/components/feedback-tag";
import { TestEnvBanner } from "@/components/test-env-banner";
import { TestEnvGate } from "@/components/test-env-gate";
import { useIsTestEnv } from "@/lib/env";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
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
    <html lang="nb">
      <head>
        <HeadContent />
        {/* Runs synchronously during parsing, before anything paints. Only
            ever true inside the Capacitor WebView — real kaupet.no visitors
            never see this class or the overlay below. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) document.documentElement.classList.add("native-boot");`,
          }}
        />
        {/* Runs before paint so there is no light-mode flash for users who
            have chosen (or whose system prefers) dark mode. Kept in sync
            with the resolution logic in src/hooks/use-theme.tsx. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("kaupet_theme");var d=t==="dark"||((t==="system"||!t)&&window.matchMedia("(prefers-color-scheme: dark)").matches);if(d)document.documentElement.classList.add("dark");}catch(e){}})();`,
          }}
        />
        <style>{`
          #native-boot-splash { display: none; }
          .native-boot #native-boot-splash {
            display: flex;
            position: fixed;
            inset: 0;
            z-index: 9999;
            align-items: center;
            justify-content: center;
            background: #fbf9f3;
            transition: opacity 200ms ease-out;
          }
          #native-boot-splash img { width: 64px; height: 64px; animation: native-boot-pulse 1.6s ease-in-out infinite; }
          @keyframes native-boot-pulse {
            0%, 100% { opacity: 0.85; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.08); }
          }
        `}</style>
      </head>
      <body>
        {/* Same background/logo as capacitor.config.ts SplashScreen + the
            iOS/Android launch images — this picks up right where the native
            splash leaves off and stays until the native layout has actually
            painted (see useIsNative / hideNativeBootSplash). */}
        <div id="native-boot-splash">
          <img src="/native-boot-icon.png" alt="" width={64} height={64} />
        </div>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();

  useEffect(() => {
    // Only invalidate on real sign-in / sign-out — NOT on INITIAL_SESSION or
    // TOKEN_REFRESHED, which fire on every mount/tab-focus and would refetch
    // every query in the app, causing the UI to feel slow and unstable.
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "SIGNED_OUT" || event === "USER_UPDATED") {
        router.invalidate();
        queryClient.invalidateQueries();
      }
      if (event === "SIGNED_IN") {
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
        <AuthProvider>
          <RootBody native={native} />
          <Toaster />
        </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function RootBody({ native }: { native: boolean }) {
  const isTest = useIsTestEnv();
  const keyboardVisible = useKeyboardVisible();

  useEffect(() => {
    // Runs after the browser has painted this render — by the time we get
    // here the native-layout DOM (bottom nav etc.) is already on screen, so
    // removing the overlay now never re-exposes the web-layout flash.
    if (native) hideNativeBootSplash();
  }, [native]);

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
    <div className="flex min-h-screen flex-col bg-background">
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
        className={`flex-1${native && !keyboardVisible ? " pb-bottom-nav" : ""}`}
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
      {native && !keyboardVisible && <AppBottomNav />}
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
