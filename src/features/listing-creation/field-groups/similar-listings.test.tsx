// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

afterEach(cleanup);

import { SimilarListings } from "./similar-listings";

describe("SimilarListings", () => {
  it("viser totalpris inkl. omregistreringsavgift for kjøretøy, ikke rå price_nok", () => {
    render(
      <SimilarListings
        similarListings={[
          {
            id: "1",
            title: "Fin bil",
            price_nok: 100_000,
            is_free: false,
            city: "Oslo",
            category_slug: "bil",
            attributes: { omregistreringsavgift_override_kr: 5_000 },
          },
        ]}
      />,
    );

    expect(screen.getByText("105 000 kr")).toBeTruthy();
    expect(screen.queryByText("100 000 kr")).toBeNull();
  });

  it("viser rå pris uendret for ikke-kjøretøy-annonser", () => {
    render(
      <SimilarListings
        similarListings={[
          {
            id: "2",
            title: "Sofa",
            price_nok: 2_000,
            is_free: false,
            city: "Bergen",
            category_slug: "mobler",
            attributes: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("2 000 kr")).toBeTruthy();
  });

  it("viser samme gratis-tekst som resten av appens formatPrice", () => {
    render(
      <SimilarListings
        similarListings={[
          {
            id: "3",
            title: "Gratis ting",
            price_nok: null,
            is_free: true,
            city: null,
            category_slug: null,
            attributes: null,
          },
        ]}
      />,
    );

    expect(screen.getByText("Gis bort")).toBeTruthy();
  });
});
