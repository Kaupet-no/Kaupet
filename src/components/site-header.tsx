import { Link } from "@tanstack/react-router";
import { MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";

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
            to="/annonser"
            search={{ q: "", category: "", sort: "new" }}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Utforsk
          </Link>
          <Link
            to="/"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Hjem
          </Link>
        </nav>

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <Link to="/meldinger" aria-label="Meldinger">
                <Button variant="ghost" size="icon" aria-label="Meldinger">
                  <MessageCircle className="size-5" />
                </Button>
              </Link>
              <UserMenu userId={user.id} email={user.email ?? null} />
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
