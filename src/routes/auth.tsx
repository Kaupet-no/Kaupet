import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { toast } from "sonner";

import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const TERMS_VERSION = "1.0";

const searchSchema = z.object({
  mode: z.enum(["signin", "signup"]).optional().default("signin"),
});

export const Route = createFileRoute("/auth")({
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "Logg inn — Kaupet.no" },
      { name: "description", content: "Logg inn eller bli medlem på Kaupet.no." },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { mode } = Route.useSearch();
  const navigate = useNavigate();
  const [isSignUp, setIsSignUp] = useState(mode === "signup");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => setIsSignUp(mode === "signup"), [mode]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/", replace: true });
    });
  }, [navigate]);

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (isSignUp) {
        if (!acceptedTerms) {
          toast.error("Du må godta brukervilkårene og personvernerklæringen for å opprette konto.");
          setLoading(false);
          return;
        }
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: window.location.origin,
            data: {
              display_name: displayName || email.split("@")[0],
              terms_accepted_version: TERMS_VERSION,
              terms_accepted_at: new Date().toISOString(),
            },
          },
        });
        if (error) throw error;
        toast.success("Konto opprettet! Sjekk e-posten for å bekrefte adressen.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        toast.success("Velkommen tilbake!");
        navigate({ to: "/", replace: true });
      }
    } catch (err: any) {
      toast.error(err?.message ?? "Noe gikk galt. Prøv igjen.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-md flex-col px-4 py-16">
      <div className="rounded-2xl border border-border bg-card p-8 shadow-sm">
        <h1 className="font-display text-3xl tracking-tight">
          {isSignUp ? "Bli medlem" : "Logg inn"}
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          {isSignUp
            ? "Det tar bare et halvt minutt og er helt gratis."
            : "Velkommen tilbake til Kaupet."}
        </p>

        <form onSubmit={handleEmailAuth} className="mt-6 space-y-4">
          {isSignUp && (
            <div className="space-y-1.5">
              <Label htmlFor="name">Visningsnavn</Label>
              <Input
                id="name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="Kari Nordmann"
              />
            </div>
          )}
          <div className="space-y-1.5">
            <Label htmlFor="email">E-post</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="kari@eksempel.no"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Passord</Label>
            <Input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Vent litt…" : isSignUp ? "Opprett konto" : "Logg inn"}
          </Button>
        </form>

        <p className="mt-6 text-center text-sm text-muted-foreground">
          {isSignUp ? "Har du allerede en konto? " : "Ny på Kaupet? "}
          <button
            type="button"
            className="font-medium text-primary hover:underline"
            onClick={() => setIsSignUp(!isSignUp)}
          >
            {isSignUp ? "Logg inn" : "Bli medlem"}
          </button>
        </p>
      </div>

      <p className="mt-6 text-center text-xs text-muted-foreground">
        <Link to="/" className="hover:underline">← Tilbake til forsiden</Link>
      </p>
    </div>
  );
}
