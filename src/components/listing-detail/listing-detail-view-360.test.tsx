// @vitest-environment jsdom

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cleanup, render as rtlRender, screen } from "@testing-library/react";
import type { ReactElement, ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListingDetailView, type ListingDetailViewProps } from "./listing-detail-view";

vi.mock("@tanstack/react-router", () => ({
  ClientOnly: ({ children }: { children: ReactNode }) => <>{children}</>,
  Link: ({ children }: { children: ReactNode }) => <a href="/">{children}</a>,
  useLocation: () => ({ pathname: "/annonse/1", search: {} }),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-media-query", () => ({ useMediaQuery: () => true }));
// Embla trenger matchMedia/ResizeObserver; karusellen er ikke det som testes.
vi.mock("@/components/ui/carousel", () => {
  const Pass = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    Carousel: Pass,
    CarouselContent: Pass,
    CarouselItem: Pass,
    CarouselPrevious: () => null,
    CarouselNext: () => null,
  };
});
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));

const render = (ui: ReactElement) =>
  rtlRender(<QueryClientProvider client={new QueryClient()}>{ui}</QueryClientProvider>);

const baseProps: ListingDetailViewProps = {
  title: "Volvo V70",
  subtitle: null,
  description: "Fin bil",
  priceNok: 100000,
  isFree: false,
  condition: null,
  city: null,
  postalCode: null,
  displayLat: null,
  displayLng: null,
  createdAt: "2026-09-12T00:00:00Z",
  updatedAt: null,
  publishedAt: "2026-09-12T00:00:00Z",
  knownIssues: null,
  noKnownIssues: null,
  maintenanceHistory: null,
  category: { name_nb: "Personbil", slug: "personbil" } as ListingDetailViewProps["category"],
  images: [],
  imgUrls: {},
  attributes: {},
  requiresDeliveryMethod: false,
  canShip: null,
};

const frames = [
  { storage_path: "360/a.jpg", frame_order: 0 },
  { storage_path: "360/b.jpg", frame_order: 1 },
];

// KG-31-F01: rammene ble ikke sendt videre til visningskroppen, så galleriet
// leste `frames.length` på undefined og hele detaljsiden krasjet.
describe("detaljvisning med 360-opptak", () => {
  afterEach(cleanup);

  it("rendrer annonsen når den bare har 360-rammer", () => {
    render(<ListingDetailView {...baseProps} vehicle360Frames={frames} />);
    expect(screen.getByRole("heading", { level: 1, name: "Volvo V70" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Se 360°-visning i fullskjerm" })).toBeTruthy();
  });

  it("rendrer annonsen med både 360-rammer og vanlige bilder", () => {
    render(
      <ListingDetailView
        {...baseProps}
        vehicle360Frames={frames}
        images={[{ storage_path: "img/1.jpg", sort_order: 0 }]}
        imgUrls={{ "img/1.jpg": "https://example.test/1.jpg" }}
      />,
    );
    expect(screen.getByRole("heading", { level: 1, name: "Volvo V70" })).toBeTruthy();
    // 360 er første (aktive) slide.
    for (const thumb of screen.getAllByRole("button", { name: "Vis 360°-visning" })) {
      expect(thumb.getAttribute("aria-pressed")).toBe("true");
    }
  });

  it("rendrer annonsen med tom rammeliste", () => {
    render(<ListingDetailView {...baseProps} vehicle360Frames={[]} />);
    expect(screen.getByRole("heading", { level: 1, name: "Volvo V70" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Se 360°-visning i fullskjerm" })).toBeNull();
  });
});
