// @vitest-environment jsdom
//
import { cleanup, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxPage } from "./inbox-page";
import { lastConversationMessages } from "@/lib/conversation-messages";

vi.mock("@/lib/conversation-messages", () => ({
  lastConversationMessages: vi.fn(async () => new Map()),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, ...props }: React.ComponentProps<"a">) => <a {...props}>{children}</a>,
}));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/pull-to-refresh-indicator", () => ({ PullToRefreshIndicator: () => null }));
vi.mock("@/hooks/use-pull-to-refresh", () => ({
  usePullToRefresh: () => ({ refreshing: false, pullDistance: 0 }),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-push-status", () => ({
  usePushStatus: () => ({ loading: true, supported: false }),
}));
vi.mock("@/lib/storage", () => ({ signListingImageUrls: vi.fn(async () => ({})) }));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));

const updateEq = vi.fn(() => ({ is: vi.fn(async () => ({ data: null, error: null })) }));

// Kjøretøyannonse med 690 000 kr selgerpris + 7 505 kr omregistreringsavgift
// (override) — samme oppsett som produserte F4: meldingslisten viste
// 690 000 kr mens annonsekortet/detaljsiden viste totalen 697 505 kr.
const vehicleConversation = {
  id: "conv-1",
  buyer_id: "user-1",
  seller_id: "seller-1",
  listing_id: "listing-1",
  last_message_at: "2026-09-10T10:00:00Z",
  buyer_last_read_at: null,
  seller_last_read_at: null,
  buyer_deleted_at: null,
  seller_deleted_at: null,
  listing: {
    id: "listing-1",
    title: "2026 Mercedes-benz Amg c 63",
    price_nok: 690_000,
    is_free: false,
    status: "active",
    attributes: { omregistreringsavgift_override_kr: 7_505 },
    categories: { slug: "bil" },
    listing_images: [],
  },
  buyer: { id: "user-1", display_name: "Kjøper", avatar_url: null, deleted_at: null },
  seller: { id: "seller-1", display_name: "Selger", avatar_url: null, deleted_at: null },
};

let conversationsData: unknown[] = [];

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      if (table === "system_messages") {
        return {
          select: () => ({
            order: async () => ({
              data: [
                {
                  id: "sys-1",
                  body: "Velkommen til Kaupet",
                  created_at: "2026-09-01T10:00:00Z",
                  read_at: null,
                },
              ],
              error: null,
            }),
          }),
          update: () => ({ eq: updateEq }),
        };
      }
      if (table === "conversations") {
        return {
          select: () => ({
            or: () => ({
              order: async () => ({ data: conversationsData, error: null }),
            }),
          }),
        };
      }
      if (table === "messages") {
        return { select: () => ({ in: () => ({ order: async () => ({ data: [] }) }) }) };
      }
      return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
    },
  },
}));

afterEach(() => {
  cleanup();
  updateEq.mockClear();
  conversationsData = [];
  vi.mocked(lastConversationMessages).mockReset().mockResolvedValue(new Map());
});

describe("InboxPage – systemmeldinger", () => {
  // Systemmeldinger vises på varselsiden (SystemMessagesCard), der Meg-fanens
  // badge peker. Innboksen er kun for samtaler.
  it("viser ikke meldinger fra Kaupet-teamet i innboksen", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { findByText, queryByText } = render(
      <QueryClientProvider client={qc}>
        <InboxPage />
      </QueryClientProvider>,
    );

    await findByText("Ingen samtaler enda");
    expect(queryByText("Velkommen til Kaupet")).toBeNull();
    expect(queryByText("Kaupet-teamet")).toBeNull();
  });
});

describe("InboxPage – pris for kjøretøyannonse (F4)", () => {
  it("viser samme totalpris (inkl. omregistreringsavgift) som annonsekortet, ikke selgers bare price_nok", async () => {
    conversationsData = [vehicleConversation];
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

    const { getByText, queryByText } = render(
      <QueryClientProvider client={qc}>
        <InboxPage />
      </QueryClientProvider>,
    );

    await waitFor(() => getByText("2026 Mercedes-benz Amg c 63"));

    expect(getByText(/697 505 kr/)).toBeTruthy();
    expect(queryByText(/690 000 kr/)).toBeNull();
  });
});

it("feilgjetting: viser feil i stedet for tom innboks når meldingene ikke kan hentes", async () => {
  conversationsData = [{ ...vehicleConversation, seller_id: "user-1", buyer_id: "buyer-1" }];
  vi.mocked(lastConversationMessages).mockRejectedValue(new Error("Kunne ikke laste meldinger"));
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { findByText, queryByText, getByRole } = render(
    <QueryClientProvider client={qc}>
      <InboxPage />
    </QueryClientProvider>,
  );
  await findByText("Kunne ikke hente samtalene");
  expect(getByRole("button", { name: "Prøv igjen" })).toBeTruthy();
  expect(queryByText("Ingen samtaler enda")).toBeNull();
});
