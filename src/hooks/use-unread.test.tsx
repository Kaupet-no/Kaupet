// @vitest-environment jsdom
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { useUnreadConversationsCount, useUnreadSystemMessagesCount } from "./use-unread";

const conversationsMock = vi.fn();
const systemMessagesMock = vi.fn();

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/lib/native", () => ({ isNative: () => false }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    channel: () => ({ on: () => ({ subscribe: () => ({}) }) }),
    removeChannel: vi.fn(),
    from: (table: string) => {
      if (table === "conversations") {
        return {
          select: () => ({
            or: () =>
              Promise.resolve(conversationsMock()).then(() => ({
                data: [
                  {
                    id: "c1",
                    last_message_at: "2026-01-01T00:00:00.000Z",
                    buyer_id: "user-2",
                    seller_id: "user-1",
                    buyer_last_read_at: null,
                    seller_last_read_at: "2026-01-01T00:00:00.000Z",
                    buyer_deleted_at: null,
                    seller_deleted_at: null,
                  },
                ],
                error: null,
              })),
          }),
        };
      }
      if (table === "messages") {
        return {
          select: () => ({
            in: () => ({
              order: () =>
                Promise.resolve({
                  data: [
                    {
                      conversation_id: "c1",
                      sender_id: "user-2",
                      created_at: "2026-01-01T00:00:00.000Z",
                    },
                  ],
                }),
            }),
          }),
        };
      }
      if (table === "system_messages") {
        return {
          select: () => ({
            is: () => Promise.resolve(systemMessagesMock()).then(() => ({ count: 2, error: null })),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("useUnreadConversationsCount", () => {
  it("teller ikke uleste systemmeldinger — kun uleste samtaler", async () => {
    // Regresjonstest for produksjonsfeilen: en konto med null uleste
    // samtaler men to uleste systemmeldinger fra «Kaupet-teamet» skal ikke
    // vise «2» som Meldinger-badge. Samtalen over er allerede lest av
    // seller (user-1), så conversationUnread skal bli 0 selv om
    // system_messages har 2 uleste.
    conversationsMock.mockClear();
    systemMessagesMock.mockClear();
    const { result } = renderHook(() => useUnreadConversationsCount(), { wrapper });

    // Vent til samtale-spørringen faktisk er kjørt (ikke bare på den
    // transiente 0-verdien før data har lastet) før vi sjekker
    // sluttresultatet.
    await waitFor(() => expect(conversationsMock).toHaveBeenCalled());
    await waitFor(() => expect(result.current).toBe(0));
    // Systemmeldinger skal ikke engang bli spurt av denne hooken.
    expect(systemMessagesMock).not.toHaveBeenCalled();
  });
});

describe("useUnreadSystemMessagesCount", () => {
  it("eksponerer uleste systemmeldinger separat", async () => {
    const { result } = renderHook(() => useUnreadSystemMessagesCount(), { wrapper });

    await waitFor(() => expect(result.current).toBe(2));
  });
});
