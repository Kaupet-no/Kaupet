// @vitest-environment jsdom
//
// Regresjonstest for badge-bugen: å merke en systemmelding som lest skal
// invalidere BÅDE innboks-listen ("system-messages") og badge-tellingen
// ("system-messages-unread") som src/hooks/use-unread.ts bruker. Før fiksen
// invaliderte inbox-page.tsx kun "system-messages", så bunnnavigasjonens
// badge ble stående på gammelt tall til appen ble sendt til bakgrunnen.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InboxPage } from "./inbox-page";

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
});

describe("InboxPage – systemmelding merket som lest", () => {
  it("invaliderer badge-nøkkelen system-messages-unread, ikke bare system-messages", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { getByText } = render(
      <QueryClientProvider client={qc}>
        <InboxPage />
      </QueryClientProvider>,
    );

    const row = await waitFor(() => getByText("Velkommen til Kaupet"));
    fireEvent.click(row);

    await waitFor(() => expect(updateEq).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["system-messages-unread"] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["system-messages"] });
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
