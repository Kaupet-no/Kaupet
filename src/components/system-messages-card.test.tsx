// @vitest-environment jsdom
//
// Regresjonstest for badge-bugen: å merke en systemmelding som lest skal
// invalidere BÅDE listen ("system-messages") og badge-tellingen
// ("system-messages-unread") som src/hooks/use-unread.ts bruker. Uten den
// siste ble bunnnavigasjonens badge stående på gammelt tall til appen ble
// sendt til bakgrunnen.
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SystemMessagesCard } from "./system-messages-card";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-unread", () => ({ useUnreadSystemMessagesCount: () => 1 }));

const updateEq = vi.fn(() => ({ is: vi.fn(async () => ({ data: null, error: null })) }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
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
    }),
  },
}));

afterEach(() => {
  cleanup();
  updateEq.mockClear();
});

describe("SystemMessagesCard – systemmelding merket som lest", () => {
  it("invaliderer badge-nøkkelen system-messages-unread, ikke bare system-messages", async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const invalidateSpy = vi.spyOn(qc, "invalidateQueries");

    const { findByText } = render(
      <QueryClientProvider client={qc}>
        <SystemMessagesCard />
      </QueryClientProvider>,
    );

    fireEvent.click(await findByText("Velkommen til Kaupet"));

    await waitFor(() => expect(updateEq).toHaveBeenCalled());
    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["system-messages-unread"] }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["system-messages"] });
  });
});
