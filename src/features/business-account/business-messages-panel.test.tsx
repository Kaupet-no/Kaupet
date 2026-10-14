// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import type { BusinessOrganization } from "./use-business-membership";
import { BusinessMessagesPanel } from "./business-messages-panel";

const fixture = vi.hoisted(() => ({
  conversations: Array.from({ length: 1001 }, (_, index) => ({
    id: crypto.randomUUID(),
    buyer_id: crypto.randomUUID(),
    seller_id: "seller",
    listing_id: `listing-${index}`,
    last_message_at: "2026-10-02T12:00:00Z",
    listing: { id: `listing-${index}`, title: `Annonse ${index}`, listing_images: [] },
  })),
  failProfiles: false,
}));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return {
    supabase: createClient("https://test.invalid", "test-key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          if (url.href.length > 8000)
            return Response.json({ message: "URI too long" }, { status: 414 });
          const ids = url.searchParams.get("id")?.slice(4, -1).split(",") ?? [];
          if (url.pathname.endsWith("/profiles")) {
            if (fixture.failProfiles && ids.includes(fixture.conversations.at(-1)!.buyer_id)) {
              return Response.json({ message: "Profiles unavailable" }, { status: 400 });
            }
            return Response.json(
              ids.slice(0, 1000).map((id) => ({
                id,
                display_name: `Kjøper ${id}`,
                avatar_url: null,
                deleted_at: null,
              })),
            );
          }
          if (ids.length)
            return Response.json(
              ids.slice(0, 1000).map((id) => ({
                id,
                messages: [
                  {
                    body: `Melding ${id}`,
                    sender_id: "buyer",
                    created_at: "2026-10-02T12:00:00Z",
                    deleted_at: null,
                    attachment_path: null,
                  },
                ],
              })),
            );
          const offset = Number(url.searchParams.get("offset") ?? 0);
          return Response.json(fixture.conversations.slice(offset, offset + 1000));
        },
      },
    }),
  };
});
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));
vi.mock("@/lib/storage", () => ({ signListingImageUrls: () => ({}) }));
afterEach(() => {
  cleanup();
  fixture.failProfiles = false;
});

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <BusinessMessagesPanel
        organization={{ id: "org" } as BusinessOrganization}
        locationId="all"
      />
    </QueryClientProvider>,
  );
}

it("viser kjøper og siste melding også for samtale 1001", async () => {
  const { container, findByText } = renderPanel();
  const last = fixture.conversations.at(-1)!;
  await findByText("1001 samtaler", { selector: "p" });
  const rows = container.querySelectorAll("li");
  expect(rows).toHaveLength(1001);
  const lastRow = within(rows[rows.length - 1]);
  expect(lastRow.getByText(`Kjøper ${last.buyer_id}`)).toBeTruthy();
  expect(lastRow.getByText(`Melding ${last.id}`)).toBeTruthy();
  expect(container.textContent).not.toContain("Ukjent kjøper");
  expect(container.textContent).not.toContain("Ingen meldinger enda");
});

it("viser feil hvis en senere gruppe kjøperprofiler ikke kan hentes", async () => {
  fixture.failProfiles = true;
  const { findByText, queryByText } = renderPanel();
  expect(
    await findByText("Kunne ikke laste bedriftens meldinger. Prøv igjen senere."),
  ).toBeTruthy();
  expect(queryByText("Ukjent kjøper")).toBeNull();
});
