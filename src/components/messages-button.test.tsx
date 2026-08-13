// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { MessagesButton } from "./messages-button";

let queryResult: Record<string, unknown>;
const refetch = vi.fn();

vi.mock("@tanstack/react-query", () => ({
  useQuery: () => queryResult,
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => (
    <a href="#" {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => true }));
vi.mock("@/hooks/use-unread", () => ({ useUnreadConversationsCount: () => 0 }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
  },
}));
vi.mock("@/components/ui/native-sheet", () => ({
  NativeSheet: ({
    open,
    onOpenChange,
    children,
  }: {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    children: React.ReactNode;
  }) => (
    <>
      <button type="button" onClick={() => onOpenChange(true)}>
        Åpne meldinger
      </button>
      {open && <section>{children}</section>}
    </>
  ),
}));

afterEach(() => {
  cleanup();
  refetch.mockReset();
});

describe("MessagesButton", () => {
  it("shows loading, error and empty states separately", () => {
    queryResult = { data: undefined, refetch, isLoading: true, isError: false, isFetching: false };
    const { getByLabelText, getByText, rerender } = render(<MessagesButton />);
    fireEvent.click(getByText("Åpne meldinger"));
    expect(getByLabelText("Laster meldinger")).toBeTruthy();

    queryResult = { data: undefined, refetch, isLoading: false, isError: true, isFetching: false };
    rerender(<MessagesButton />);
    expect(getByText("Kunne ikke laste meldinger")).toBeTruthy();
    fireEvent.click(getByText("Prøv igjen"));
    expect(refetch).toHaveBeenCalledOnce();

    queryResult = { data: [], refetch, isLoading: false, isError: false, isFetching: false };
    rerender(<MessagesButton />);
    expect(getByText("Ingen meldinger ennå")).toBeTruthy();
  });

  it("uses a readable native conversation row and full inbox action", () => {
    queryResult = {
      data: [
        {
          id: "conversation-1",
          buyer_id: "user-1",
          seller_id: "user-2",
          buyer_last_read_at: null,
          seller_last_read_at: null,
          last_message_at: "2026-08-13T12:00:00.000Z",
          last_message_sender_id: "user-2",
          other_name: "Ola Nordmann",
          listing_title: "Sykkel",
          last_message_body: "Er den fortsatt tilgjengelig?",
        },
      ],
      refetch,
      isLoading: false,
      isError: false,
      isFetching: true,
    };
    const { getByRole, getByText } = render(<MessagesButton />);
    fireEvent.click(getByText("Åpne meldinger"));

    expect(getByRole("link", { name: /ulest melding fra ola nordmann/i }).className).toContain(
      "min-h-16",
    );
    expect(getByRole("link", { name: "Se alle meldinger" }).className).toContain("h-14");
    expect(getByRole("status").textContent).toBe("Oppdaterer meldinger");
  });
});
