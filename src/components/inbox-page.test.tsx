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
              order: async () => ({ data: [], error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ order: async () => ({ data: [], error: null }) }) };
    },
  },
}));

afterEach(() => {
  cleanup();
  updateEq.mockClear();
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
