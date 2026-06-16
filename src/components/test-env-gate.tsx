import { Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/use-is-admin";
import { useIsDemo } from "@/lib/use-is-demo";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gates the entire site when running on test.kaupet.no.
 * Only authenticated users with the `admin` or `demo` role may proceed.
 */
export function TestEnvGate({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const { data: isAdmin, isLoading: adminLoading } = useIsAdmin();
  const { data: isDemo, isLoading: demoLoading } = useIsDemo();

  if (loading || (user && (adminLoading || demoLoading))) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-sm text-muted-foreground">Laster testmiljø…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <Lock className="mx-auto h-10 w-10 text-yellow-500" />
          <h1 className="mt-4 text-xl font-semibold">Testmiljø — innlogging kreves</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            test.kaupet.no er kun tilgjengelig for demobrukere og administratorer. Logg inn for å
            fortsette.
          </p>
          <div className="mt-6">
            <Button asChild>
              <Link to="/auth" search={{ mode: "signin" }}>
                Logg inn
              </Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const hasAccess = isAdmin || isDemo;
  if (!hasAccess) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <div className="max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
          <Lock className="mx-auto h-10 w-10 text-destructive" />
          <h1 className="mt-4 text-xl font-semibold">Ingen tilgang til testmiljøet</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Din konto har ikke tilgang til test.kaupet.no. Kontakt en administrator hvis du mener
            dette er feil, eller gå til hovedsiden.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button
              variant="outline"
              onClick={async () => {
                await supabase.auth.signOut();
              }}
            >
              Logg ut
            </Button>
            <Button asChild>
              <a href="https://kaupet.no">Til kaupet.no</a>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
