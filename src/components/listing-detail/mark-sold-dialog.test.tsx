// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { MarkSoldDialog } from "./mark-sold-dialog";

vi.mock("@/lib/conversation-messages", () => ({
  lastConversationMessages: vi.fn(async () => new Map([["c1", { body: "Hei" }]])),
}));

const updateStatus = vi.fn(async (_args: unknown) => ({}));
const confirmBuyer = vi.fn(async (_args: unknown) => ({}));

vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: unknown) => fn,
}));
vi.mock("@/lib/listings.functions", () => ({
  updateListingStatus: (args: unknown) => updateStatus(args),
}));
vi.mock("@/lib/sales.functions", () => ({ confirmBuyer: (args: unknown) => confirmBuyer(args) }));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));

// conversations → én samtale med kjøper; messages → samtalen har meldinger.
function query(table: string) {
  const rows =
    table === "conversations"
      ? [{ id: "c1", buyer_id: "b1", buyer: { display_name: "Kari", avatar_url: null } }]
      : [{ conversation_id: "c1" }];
  const result = Promise.resolve({ data: rows, error: null });
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: () => result,
    order: () => result,
  };
  return builder;
}
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: query } }));

afterEach(cleanup);

it("kan merke som solgt uten å velge kjøper selv om noen har tatt kontakt", async () => {
  render(
    <QueryClientProvider client={new QueryClient()}>
      <MarkSoldDialog open onOpenChange={vi.fn()} listingId="l1" />
    </QueryClientProvider>,
  );

  expect(await screen.findByText("Kari")).toBeTruthy();
  expect(
    (screen.getByRole("button", { name: "Bekreft kjøper" }) as HTMLButtonElement).disabled,
  ).toBe(true);

  fireEvent.click(screen.getByRole("button", { name: "Merk som solgt uten å velge kjøper" }));

  await waitFor(() =>
    expect(updateStatus).toHaveBeenCalledWith({ data: { id: "l1", status: "sold" } }),
  );
  expect(confirmBuyer).not.toHaveBeenCalled();
});
