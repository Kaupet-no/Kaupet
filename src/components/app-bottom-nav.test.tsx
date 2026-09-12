// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { UserAvatarButton } from "./app-bottom-nav";
import { hapticImpact } from "@/lib/haptics";

let unreadCount = 0;
let unreadSystemCount = 0;
const navigateMock = vi.fn();

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigateMock }));
vi.mock("@tanstack/react-query", () => ({
  useQuery: () => ({ data: { display_name: "Kari", avatar_url: null } }),
}));
vi.mock("@/hooks/use-unread", () => ({
  useUnreadNotificationsCount: () => unreadCount,
  useUnreadSystemMessagesCount: () => unreadSystemCount,
}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));
vi.mock("@/lib/haptics", () => ({ hapticImpact: vi.fn() }));

afterEach(() => {
  cleanup();
  unreadCount = 0;
  unreadSystemCount = 0;
  navigateMock.mockReset();
  vi.mocked(hapticImpact).mockClear();
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

  it("gir nøyaktig ett haptikk-signal per trykk på Meg-fanen", () => {
    render(<UserAvatarButton userId="user-1" email="kari@eksempel.no" />);

    fireEvent.click(screen.getByRole("button", { name: "Meg" }));

    expect(hapticImpact).toHaveBeenCalledOnce();
    expect(hapticImpact).toHaveBeenCalledWith("light");
  });
});
