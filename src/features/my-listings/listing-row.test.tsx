// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ListingRow, type Row } from "./listing-row";

afterEach(cleanup);

vi.mock("@/lib/storage", () => ({
  signListingImageUrls: vi.fn().mockResolvedValue({}),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

const row: Row = {
  id: "1",
  kaupet_code: "ABC123",
  title: "Test-annonse",
  status: "active",
  price_nok: 100,
  is_free: false,
  city: "Oslo",
  category_id: null,
  description: null,
  view_count: 0,
  favorite_count: 0,
  created_at: new Date().toISOString(),
  expires_at: null,
  cover_path: null,
};

const noop = () => {};

describe("ListingRow", () => {
  it("shows the promote action for every user, not just demo/admin roles", () => {
    const { getAllByText } = render(
      <ListingRow
        row={row}
        activePromotion={null}
        onPromote={noop}
        onMarkSold={noop}
        onReactivate={noop}
        onRepublish={noop}
        onPublishDraft={noop}
        onDelete={noop}
        busy={false}
      />,
    );

    expect(getAllByText("Fremhev annonse").length).toBeGreaterThan(0);
  });
});
