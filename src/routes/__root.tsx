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
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SiteHeader } from "@/components/site-header";
import { ModerationBanner } from "@/components/moderation-banner";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";

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
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

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
      { name: "viewport", content: "width=device-width, initial-scale=1" },
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
      { name: "description", content: "Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame." },
      { property: "og:description", content: "Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame." },
      { name: "twitter:description", content: "Kaupet.no er en norsk markedsplass for brukte ting mellom privatpersoner. Ingen mellomledd, ingen reklame." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Zav741ZnKNZxYODrMCRKtvCwST03/social-images/social-1780646011042-Skjermbilde_2026-06-05_kl._09.35.02.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/Zav741ZnKNZxYODrMCRKtvCwST03/social-images/social-1780646011042-Skjermbilde_2026-06-05_kl._09.35.02.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap",
      },
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
      </head>
      <body>
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
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
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
              const { toast } = await import("sonner");
              toast.success(
                "Velkommen tilbake! Slettingen av kontoen din er avbrutt.",
              );
            }
          } catch {
            // ignore
          }
        })();
      }
    });
    return () => subscription.unsubscribe();
  }, [router, queryClient]);


  return (
    <QueryClientProvider client={queryClient}>
      <div className="flex min-h-screen flex-col bg-background">
        <SiteHeader />
        <ModerationBanner />
        <main className="flex-1">
          <Outlet />
        </main>
        <footer className="border-t border-border bg-surface">
          <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
            <p>
              © {new Date().getFullYear()} Kaupet.no — Bygget med åpen kildekode,{" "}
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
            <p className="sm:max-w-xl sm:text-right">
              Ditt personvern på internett er viktig. Kaupet.no benytter derfor ingen sporende informasjonskapsler eller tredjeparts analyseverktøy. Les vår{" "}
              <Link to="/personvern" className="underline hover:text-foreground transition-colors">
                personvernerklæring her
              </Link>
              .
            </p>
          </div>
        </footer>
      </div>
      <Toaster />
    </QueryClientProvider>
  );
}
