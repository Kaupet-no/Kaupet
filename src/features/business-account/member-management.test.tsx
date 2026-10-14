// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ update: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => (fn === "update" ? mocks.update : vi.fn()),
}));
vi.mock("@/lib/business/locations.functions", () => ({ setOrganizationLocationMember: "update" }));
vi.mock("@/lib/business/members.functions", () => ({
  inviteOrganizationMember: "invite",
  resendOrganizationInvite: "resend",
  removeOrganizationMember: "remove",
}));

const rows: Record<string, unknown[]> = {
  categories: [],
  organization_members: [
    {
      user_id: "member-1",
      role: "member",
      status: "active",
      created_at: "2026-10-01T00:00:00Z",
      can_create_listings: false,
      category_access: "all",
    },
  ],
  profiles: [{ id: "member-1", display_name: "Kari" }],
  organization_member_categories: [],
  organization_location_members: [
    {
      user_id: "member-1",
      location_id: "loc-1",
      role: "member",
      listing_access: "own",
      listing_edit_scope: "own",
      chat_access: "own",
    },
  ],
};
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      for (const method of ["select", "eq", "in", "order"]) query[method] = () => query;
      query.then = (resolve: (value: unknown) => unknown) =>
        resolve({ data: rows[table] ?? [], error: null });
      return query;
    },
  },
}));

import { MemberManagement } from "./member-management";

afterEach(cleanup);

// KG-06-F03: skjemaet viste rolle, opprettelsesrett og kategorier som aldri ble lagret.
it("viser bare lokasjonstilgangene som faktisk lagres i rettighetsdialogen", async () => {
  mocks.update.mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MemberManagement
        organization={
          {
            id: "org-1",
            selected_plan: "proff",
            proff_access_until: "2099-01-01T00:00:00Z",
          } as never
        }
        locations={[{ id: "loc-1", is_default: true } as never]}
        userId="super-1"
        role="superuser"
      />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Rettigheter" }));
  const dialog = await screen.findByRole("alertdialog");

  expect(within(dialog).queryByLabelText("Rolle")).toBeNull();
  expect(within(dialog).queryByText("Kan opprette annonser")).toBeNull();
  expect(within(dialog).queryByLabelText("Kategorier for nye annonser")).toBeNull();

  fireEvent.change(within(dialog).getByLabelText("Chatinnsyn"), { target: { value: "all" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Lagre rettigheter" }));
  await waitFor(() => expect(mocks.update).toHaveBeenCalled());
  expect(mocks.update.mock.calls[0][0].data).toEqual({
    locationId: "loc-1",
    userId: "member-1",
    role: "member",
    listingAccess: "own",
    listingEditScope: "own",
    chatAccess: "all",
  });
});
