import { Link } from "@tanstack/react-router";
import { MessageCircle, Search } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { useUnreadConversationsCount } from "@/hooks/use-unread";
import { useSearchPanel } from "@/features/listing-search/search-panel/search-panel-context";
import { ANNONSER_SEARCH_INPUT_ID } from "@/features/listing-search/search-input-id";
import { trackProductEvent } from "@/lib/product-analytics";

const HEADER_SEARCH_SLOT_ID = "header-search-slot";

export function HeaderSearchPortal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);

  // This post-mount render is the hydration boundary for the client-only portal target.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => setMounted(true), []);

  const slot = mounted ? document.getElementById(HEADER_SEARCH_SLOT_ID) : null;
  return slot ? createPortal(children, slot) : null;
}

export function SiteHeader() {
  const { user } = useAuth();
  const { openPanel } = useSearchPanel();

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur pt-safe">
      <nav
        aria-label="Hovednavigasjon"
        className="mx-auto flex h-16 w-full max-w-[1600px] items-center gap-4 px-4"
      >
        <Link to="/" className="flex shrink-0 items-baseline gap-1">
          <span className="font-display text-2xl font-semibold tracking-tight text-primary">
            kaupet
          </span>
          <span className="font-display text-2xl text-accent">.</span>
          <span className="font-display text-xl text-muted-foreground">no</span>
        </Link>

        <div id={HEADER_SEARCH_SLOT_ID} className="hidden flex-1 md:block" />

        <div className="ml-auto flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="md:hidden"
            aria-label="Åpne søk"
            onClick={() => {
              trackProductEvent("search_opened", { source: "header" });
              const input = document.getElementById(ANNONSER_SEARCH_INPUT_ID);
              if (input instanceof HTMLInputElement && input.getClientRects().length > 0) {
                input.scrollIntoView({ block: "center" });
                input.focus({ preventScroll: true });
                return;
              }
              openPanel("query");
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
              <Button asChild size="sm" variant="ghost" className="max-[359px]:hidden">
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
