// @vitest-environment jsdom
import { type HTMLAttributes, type ReactNode } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { useFormFactor } from "@/hooks/use-form-factor";
import { SearchFilterSidebar } from "./search-filter-sidebar";
import { SearchPanel } from "./search-panel";

vi.mock("vaul", () => ({
  Drawer: {
    Root: ({ children }: { children: ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
    Overlay: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
    Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Title: ({ children }: { children: ReactNode }) => <>{children}</>,
    Description: ({ children }: { children: ReactNode }) => <>{children}</>,
    Trigger: ({ children }: { children: ReactNode }) => <>{children}</>,
    Close: ({ children }: { children: ReactNode }) => <>{children}</>,
    Handle: () => null,
    NestedRoot: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/advanced-search-sheet", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/components/advanced-search-sheet")>();
  return { ...original, SaveSearchDialog: () => null };
});
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-form-factor", () => {
  // Utledet, ikke hardkodet: testene bytter bare `useFormFactor`, og da skal
  // `useIsNarrow`/`useIsDesktop` følge med slik de gjør i produksjon.
  const useFormFactor = vi.fn(() => "web");
  // Disse er mock-hooks, ikke komponenter — regelen kan ikke se forskjellen.
  /* eslint-disable react-hooks/rules-of-hooks */
  return {
    useFormFactor,
    useIsDesktop: () => useFormFactor() === "desktop",
    useIsNarrow: () => useFormFactor() === "phone" || useFormFactor() === "web",
  };
  /* eslint-enable react-hooks/rules-of-hooks */
});
vi.mock("@/features/listing-search/use-search-suggestions", () => ({
  useSearchSuggestions: () => ({ data: [] }),
}));
vi.mock("@/hooks/use-overlay-history", () => ({ useOverlayHistory: () => undefined }));
vi.mock("@/hooks/use-sheet-drag-gate", () => ({
  useSheetDragGate: () => ({
    snapPoints: [0.6, 1],
    setGatedSnapPoint: vi.fn(),
    dragCaptureProps: {},
  }),
}));
vi.mock("@/lib/vehicle/vehicle-brands", () => ({ useAllVehicleBrands: () => ({ data: [] }) }));
// Skuffens underark (kategori/tilstand) er ikke det denne testen handler om.
vi.mock("@/components/ui/native-sheet", () => ({ NativeSheet: () => null }));
vi.mock("@/components/ui/native-choice-sheet", () => ({ NativeChoiceSheet: () => null }));
vi.mock("@/features/listing-search/use-draft-result-count", () => ({
  useDraftResultCount: () => ({ count: 7, isPending: false }),
}));

// Radix' størrelsesmåling i jsdom.
globalThis.ResizeObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as never;

const categories = [
  {
    id: "1",
    slug: "sykkel",
    name_nb: "Sykkel",
    parent_id: null,
    sort_order: 1,
    icon: null,
    hidden: false,
  },
] as never;

const attributeFilters = [
  {
    id: "f1",
    category_id: "1",
    key: "merke",
    label_nb: "Merke",
    kind: "multiselect",
    options: [{ value: "trek", label_nb: "Trek" }],
    sort_order: 1,
    is_primary: true,
  },
  {
    id: "f2",
    category_id: "1",
    key: "ramme",
    label_nb: "Rammestørrelse",
    kind: "multiselect",
    options: [{ value: "m", label_nb: "M" }],
    sort_order: 2,
    is_primary: false,
  },
] as never;

const results = {
  applied: { value: { ...defaultAdvancedSearchValue(), categories: ["sykkel"] }, attributes: {} },
  onApply: () => {},
  attributeFilters,
  resultCount: 5,
} as never;

afterEach(() => {
  // mockReturnValue i én test skal ikke lekke til neste.
  vi.mocked(useFormFactor).mockReturnValue("web");
  cleanup();
});

function renderPanel(overrides?: Record<string, unknown>) {
  render(
    <SearchPanel
      open
      onOpenChange={() => {}}
      categories={categories}
      allFilters={attributeFilters}
      initialSection="categories"
      results={overrides ? ({ ...(results as object), ...overrides } as never) : results}
    />,
  );
}

describe("SearchPanel filteroppsett", () => {
  it("viser mobilweb som arbeidsflate med samme grupper som desktop", () => {
    const sidebar = render(<SearchFilterSidebar results={results} categories={categories} />);
    expect(sidebar.getByText("Pris (NOK)")).toBeTruthy();
    fireEvent.mouseDown(sidebar.getByRole("tab", { name: "Detaljer" }), { button: 0 });
    expect(sidebar.getByText("Merke")).toBeTruthy();
    expect(sidebar.queryByText("Rammestørrelse")).toBeNull();
    fireEvent.mouseDown(sidebar.getByRole("tab", { name: "Mer" }), { button: 0 });
    expect(sidebar.getByText("Rammestørrelse")).toBeTruthy();
    cleanup();

    renderPanel();
    expect(screen.getByText("Pris (NOK)")).toBeTruthy();
    expect(screen.getByText("Søket ditt")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Detaljer" }), { button: 0 });
    expect(screen.getByText("Merke")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Mer" }), { button: 0 });
    expect(screen.getByText("Rammestørrelse")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vis 5 annonser" })).toBeTruthy();
  });

  /* Kategorilandingssidene (`/bil-og-mc` osv.) har kategorien fra URL-en, og
     `effectiveSearch` der overstyrer `categories` ubetinget. En kategorivelger
     i panelet ville stått og ikke gjort noe — resten av filtersettet er likt. */
  it("skjuler kategorivalget når ruten eier kategorien", () => {
    renderPanel({ categoryLocked: true });
    expect(screen.queryByRole("button", { name: /Kategori/ })).toBeNull();
    // Resten av settet er uendret.
    expect(screen.getByText("Tilstand")).toBeTruthy();
    expect(screen.getByText("Sted")).toBeTruthy();
    cleanup();

    renderPanel();
    expect(screen.getByRole("button", { name: /Kategori/ })).toBeTruthy();
  });

  it("viser samme arbeidsflate på native telefon", () => {
    vi.mocked(useFormFactor).mockReturnValue("phone");
    renderPanel();

    expect(screen.getByText("Søket ditt")).toBeTruthy();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Mer" }), { button: 0 });
    expect(screen.getByText("Flere søkevalg")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vis 5 annonser" })).toBeTruthy();
  });

  it("viser arbeidsflaten i dialog på native nettbrett", () => {
    vi.mocked(useFormFactor).mockReturnValue("tablet");
    renderPanel();

    expect(screen.getByText("Søket ditt")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Basis" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Vis 5 annonser" })).toBeTruthy();
  });

  it("bruker mobilweb-utkastet først når brukeren trykker Vis annonser", () => {
    const onApply = vi.fn();
    renderPanel({ onApply });

    fireEvent.click(screen.getByRole("button", { name: "Som ny" }));
    expect(onApply).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Vis 7 annonser" }));
    expect(onApply).toHaveBeenCalledOnce();
    expect(onApply.mock.calls[0][0].value.conditions).toEqual(["like_new"]);
  });
});
