// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { NotificationItemContent } from "./notification-item-content";

afterEach(cleanup);

const base = {
  id: "n1",
  listing_id: "l1",
  read_at: null,
  created_at: new Date().toISOString(),
  listing_title: "Sykkelhjelm",
  listing_code: "12345678",
};

describe("NotificationItemContent", () => {
  it("viser «favoritt solgt»-varsler", () => {
    render(<NotificationItemContent n={{ ...base, kind: "sold" }} />);
    expect(screen.getByText(/Favoritten din er solgt/)).toBeTruthy();
  });

  it("dobler ikke anførselstegn rundt søkenavn lagret med sitattegn", () => {
    render(
      <NotificationItemContent
        n={{
          ...base,
          kind: "search",
          saved_search_id: "s1",
          search_name: '"hjelm"',
        }}
      />,
    );
    expect(screen.getByText(/Treff i «hjelm»/)).toBeTruthy();
  });
});
