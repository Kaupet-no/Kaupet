import { Link, useNavigate } from "@tanstack/react-router";
import { MessageCircle, FolderOpen } from "lucide-react";
import { useMemo, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { UserMenu } from "@/components/user-menu";
import { NotificationsBell } from "@/components/notifications-bell";
import { useUnreadConversationsCount } from "@/hooks/use-unread";
import { useCategories } from "@/hooks/use-root-categories";
import { CategoryPicker } from "@/components/category-picker";

export function SiteHeader() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: categories } = useCategories();
  const [categoryPickerOpen, setCategoryPickerOpen] = useState(false);

  const rootCategories = useMemo(
    () => (categories ?? []).filter((c) => c.parent_id === null),
    [categories],
  );
  const slugById = useMemo(
    () => new Map((categories ?? []).map((c) => [c.id, c.slug])),
    [categories],
  );

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

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="hidden shrink-0 gap-1.5 md:inline-flex"
          onClick={() => setCategoryPickerOpen(true)}
        >
          <FolderOpen className="size-4" />
          Kategorier
        </Button>
        <CategoryPicker
          open={categoryPickerOpen}
          onOpenChange={setCategoryPickerOpen}
          categories={rootCategories}
          selectedId=""
          onSelect={(categoryId) => {
            const slug = slugById.get(categoryId) ?? "";
            navigate({ to: "/annonser", search: { q: "", category: slug, sort: "new" } });
          }}
        />

        <div className="ml-auto flex items-center gap-2">
          {user ? (
            <>
              <NotificationsBell />
              <MessagesIconLink />
              <UserMenu userId={user.id} email={user.email ?? null} />
            </>
          ) : (
            <>
              <Link to="/auth">
                <Button size="sm" variant="ghost">
                  Logg inn
                </Button>
              </Link>
              <Link to="/auth" search={{ mode: "signup" }}>
                <Button size="sm">Bli medlem</Button>
              </Link>
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
    <Link to="/meldinger" aria-label="Meldinger" className="relative">
      <Button variant="ghost" size="icon" aria-label="Meldinger">
        <MessageCircle className="size-5" />
      </Button>
      {unread > 0 && (
        <span
          className="pointer-events-none absolute right-0 top-0 flex h-5 min-w-5 items-center justify-center rounded-full bg-accent px-1 text-[10px] font-semibold text-accent-foreground"
          aria-label={`${unread} uleste samtaler`}
        >
          {unread > 9 ? "9+" : unread}
        </span>
      )}
    </Link>
  );
}
