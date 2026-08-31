// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserAvatarButton } from "./app-bottom-nav";

let unreadCount = 0;

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { display_name: "Kari", avatar_url: null } }),
}));
vi.mock("@/hooks/use-unread", () => ({
  useUnreadNotificationsCount: () => unreadCount,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

afterEach(() => {
  cleanup();
  unreadCount = 0;
});

describe("UserAvatarButton", () => {
  it("viser ingen badge når det ikke finnes uleste varsler", () => {
    render(<UserAvatarButton userId="user-1" email="kari@eksempel.no" />);

    expect(screen.getByRole("button", { name: "Meg" })).toBeTruthy();
    expect(screen.queryByText(/varsler/)).toBeNull();
  });

  it("viser antall uleste varsler som badge og i tilgjengelig navn", () => {
    unreadCount = 3;
    render(<UserAvatarButton userId="user-1" email="kari@eksempel.no" />);

    expect(screen.getByRole("button", { name: "Meg, 3 nye varsler" })).toBeTruthy();
    expect(screen.getByText("3")).toBeTruthy();
  });

  it("stopper badgetallet på 9+ ved mange uleste varsler", () => {
    unreadCount = 12;
    render(<UserAvatarButton userId="user-1" email="kari@eksempel.no" />);

    expect(screen.getByText("9+")).toBeTruthy();
  });
});
