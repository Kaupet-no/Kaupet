import { Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle, Search } from "lucide-react";
import { useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { useUnreadConversationsCount } from "@/hooks/use-unread";
import { Input } from "@/components/ui/input";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import { trackProductEvent } from "@/lib/product-analytics";

export function SiteHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { openPanel } = useSearchPanel();
  const [query, setQuery] = useState("");

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur pt-safe">
      <nav
        aria-label="Hovednavigasjon"
        className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4"
      >
        <Link to="/" className="flex shrink-0 items-baseline gap-1">
          <span className="font-display text-2xl font-semibold tracking-tight text-primary">
            kaupet
          </span>
          <span className="font-display text-2xl text-accent">.</span>
          <span className="font-display text-xl text-muted-foreground">no</span>
        </Link>

        <form
          role="search"
          className="mx-auto hidden w-full max-w-md md:block"
          onSubmit={(event) => {
            event.preventDefault();
            const q = query.trim();
            trackProductEvent("search_submitted", { source: "header", hasQuery: !!q });
            void navigate({ to: "/annonser", search: { q, category: "", sort: "new" } });
          }}
        >
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Søk i annonser"
              aria-label="Søk i annonser"
              className="bg-muted/60 pl-9 pr-11"
            />
            <button
              type="submit"
              aria-label="Søk"
              className="absolute right-0 top-0 flex size-11 items-center justify-center rounded-r-md text-muted-foreground transition hover:text-foreground"
            >
              <Search className="size-4" />
            </button>
          </div>
        </form>

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Åpne søk"
            onClick={() => {
              trackProductEvent("search_opened", { source: "header" });
              openPanel("categories");
            }}
          >
            <Search className="size-5" />
          </Button>
          {user ? (
            <>
              <NotificationsBell />
              <MessagesIconLink />
              <UserMenu userId={user.id} email={user.email ?? null} />
            </>
          ) : (
            <>
              <Button asChild size="sm" variant="ghost">
                <Link to="/auth">Logg inn</Link>
              </Button>
              <Button asChild size="sm">
                <Link to="/auth" search={{ mode: "signup" }}>
                  Bli medlem
                </Link>
              </Button>
            </>
          )}
        </div>
      </nav>
    </header>
  );
}

function MessagesIconLink() {
  const unread = useUnreadConversationsCount();
  return (
    <Button asChild variant="ghost" size="icon">
      <Link to="/meldinger" aria-label="Meldinger" className="relative">
        <MessageCircle className="size-5" />
        {unread > 0 && (
          <span
            className="pointer-events-none absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground"
            aria-label={`${unread} uleste samtaler`}
          >
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </Link>
    </Button>
  );
}
