import { Link } from "@tanstack/react-router";
import { Search, Plus, Heart, MessageCircle, User as UserIcon } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function SiteHeader() {
  const { user } = useAuth();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
        <Link to="/" className="flex items-baseline gap-1">
          <span className="font-display text-2xl font-semibold tracking-tight text-primary">
            kaupet
          </span>
          <span className="font-display text-2xl text-accent">.</span>
          <span className="font-display text-xl text-muted-foreground">no</span>
        </Link>

        <nav className="hidden flex-1 items-center gap-6 md:flex">
          <Link
            to="/"
            search={{ q: "" }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Utforsk
          </Link>
          <span className="text-sm text-muted-foreground/50">Kategorier</span>
          <span className="text-sm text-muted-foreground/50">Om Kaupet</span>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Button variant="ghost" size="icon" aria-label="Favoritter" disabled>
                <Heart className="size-5" />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Meldinger" disabled>
                <MessageCircle className="size-5" />
              </Button>
              <Button size="sm" variant="secondary" disabled>
                <UserIcon className="size-4" /> Min side
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => supabase.auth.signOut()}
              >
                Logg ut
              </Button>
              <Button size="sm" disabled>
                <Plus className="size-4" /> Ny annonse
              </Button>
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button size="sm" variant="ghost">Logg inn</Button>
              </Link>
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button size="sm">Bli medlem</Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
