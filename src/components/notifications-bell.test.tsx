// @vitest-environment jsdom
//
// På nett er bjellen eneste inngang til meldinger fra Kaupet-teamet (de bor
// på /varsler, ikke i innboksen). Uleste slike skal derfor telles i badgen og
// ha en egen rad i menyen — ellers lover ingenting at de finnes.
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NotificationsBell } from "./notifications-bell";

let unreadSystem = 0;

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to, ...props }: React.ComponentProps<"a"> & { to: string }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-unread", () => ({ useUnreadSystemMessagesCount: () => unreadSystem }));
vi.mock("@/lib/notifications", () => ({
  listEnrichedNotifications: async () => ({ items: [], hasMore: false }),
  markAllNotificationsRead: vi.fn(),
  markNotificationItemRead: vi.fn(),
  deleteNotificationItem: vi.fn(),
  invalidateNotificationQueries: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => {
  const channel = { on: () => channel, subscribe: () => channel };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});

afterEach(() => {
  cleanup();
  unreadSystem = 0;
});

function renderBell() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NotificationsBell />
    </QueryClientProvider>,
  );
}

describe("NotificationsBell – meldinger fra Kaupet-teamet", () => {
  it("teller uleste systemmeldinger i badgen og lenker til varselsiden", async () => {
    unreadSystem = 1;
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Varsler, 1 uleste" }));

    const row = await screen.findByRole("link", { name: /Kaupet-teamet/ });
    expect(row.getAttribute("href")).toBe("/varsler");
    expect(row.textContent).toContain("1 ulest melding");
    expect(screen.queryByText(/Ingen varsler ennå/)).toBeNull();
  });

  it("lukker menyen når en lenke i den klikkes", async () => {
    unreadSystem = 1;
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Varsler, 1 uleste" }));
    fireEvent.click(await screen.findByRole("link", { name: /Kaupet-teamet/ }));

    await waitFor(() => expect(screen.queryByRole("link", { name: /Kaupet-teamet/ })).toBeNull());
  });

  it("viser ingen badge eller rad uten uleste systemmeldinger", async () => {
    renderBell();

    fireEvent.click(await screen.findByRole("button", { name: "Varsler" }));

    await screen.findByText(/Ingen varsler ennå/);
    expect(screen.queryByRole("link", { name: /Kaupet-teamet/ })).toBeNull();
  });
});
