// @vitest-environment jsdom
import type { ComponentType, ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
const { range } = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    options,
    useLoaderData: () => ({
      id: "org",
      display_name: "Bedrift",
      brand_palette: null,
    }),
  }),
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query = { select: () => query, eq: () => query, order: () => query, range };
      return query;
    },
  },
}));
vi.mock("@/components/listing-card", () => ({
  ListingCard: ({ listing }: { listing: { title: string } }) => <span>{listing.title}</span>,
}));
vi.mock("@/components/listing-detail/proff-listing-presentation", () => ({
  ProffListingHeader: () => null,
}));
import { Route } from "./bedrift.$organizationId";
const Page = (Route as unknown as { options: { component: ComponentType } }).options.component;
afterEach(cleanup);
it("KG-06-F02: offentlig bedriftsliste henter én side om gangen og kan laste flere", async () => {
  const row = {
    id: "id",
    kaupet_code: "ABC",
    title: "Annonse",
    price_nok: 100,
    is_free: false,
    city: null,
    created_at: "",
    categories: null,
    attributes: null,
    listing_images: [],
  };
  range
    .mockResolvedValueOnce({
      data: Array.from({ length: 24 }, (_, i) => ({ ...row, id: String(i) })),
      error: null,
    })
    .mockResolvedValueOnce({ data: [{ ...row, id: "last", title: "Siste annonse" }], error: null });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <Page />
    </QueryClientProvider>,
  );
  fireEvent.click(await screen.findByRole("button", { name: "Last inn flere annonser" }));
  expect(await screen.findByText("Siste annonse")).toBeTruthy();
  expect(range).toHaveBeenNthCalledWith(1, 0, 23);
  expect(range).toHaveBeenNthCalledWith(2, 24, 47);
  expect(screen.queryByRole("button", { name: "Last inn flere annonser" })).toBeNull();
});
