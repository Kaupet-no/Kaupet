// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  window.matchMedia = vi.fn().mockReturnValue({
    matches: false,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  });
});

// cmdk observerer listehøyden; jsdom har ingen ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

const mutate = vi.fn();

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/annonse">{children}</a>,
}));
vi.mock("@tanstack/react-query", () => ({
  useMutation: () => ({ isPending: false, mutate, reset: vi.fn() }),
}));
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn() }));
vi.mock("@/hooks/use-categories", () => ({
  useCategories: () => ({
    data: [
      { id: "category-1", name_nb: "Sykler", slug: "sykler", parent_id: null },
      { id: "category-2", name_nb: "Sport og friluft", slug: "sport", parent_id: null },
      { id: "category-3", name_nb: "Ski", slug: "ski", parent_id: "category-2" },
      {
        id: "category-4",
        name_nb: "E2E-testkategori",
        slug: "e2e-test-listing",
        parent_id: null,
        is_hidden: true,
      },
    ],
    isLoading: false,
  }),
  visibleCategories: (categories: Array<{ is_hidden?: boolean }>, isDemo: boolean) =>
    categories.filter((category) => isDemo || !category.is_hidden),
}));
vi.mock("@/hooks/use-is-demo", () => ({ useIsDemo: () => ({ data: false }) }));
vi.mock("@/hooks/use-category-filters", () => ({
  useAllCategoryFilters: () => ({ data: [] }),
}));
vi.mock("./listing-bulk-import.functions", () => ({ createListingsFromImport: vi.fn() }));
vi.mock("./parse-import-file", () => ({
  attributeMetaFromFilters: () => ({}),
  parseImportFile: vi.fn(async () => ({
    fileName: "annonser.csv",
    rows: [
      {
        rowNumber: 2,
        externalId: "id-1",
        category: "sykler",
        title: "En sykkel",
        description: "Dette er en god beskrivelse av varen.",
        priceNok: 4500,
        attributes: {},
      },
      {
        rowNumber: 3,
        externalId: "id-2",
        category: "sykler",
        title: "En annen sykkel",
        description: "Dette er en annen god beskrivelse av varen.",
        priceNok: 3200,
        attributes: {},
      },
    ],
    errors: [],
  })),
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
}));
vi.mock("@/components/ui/responsive-overlay", () => ({
  ResponsiveOverlay: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  ResponsiveOverlayContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/popover", () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/alert-dialog", () => ({
  AlertDialog: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  AlertDialogDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  AlertDialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  AlertDialogCancel: ({ children }: { children: React.ReactNode }) => <button>{children}</button>,
  AlertDialogAction: ({
    children,
    onClick,
  }: {
    children: React.ReactNode;
    onClick: (event: React.MouseEvent) => void;
  }) => <button onClick={onClick}>{children}</button>,
}));

import { BulkListingImport } from "./BulkListingImport";

describe("BulkListingImport", () => {
  it("viser forhåndsvisning med antall gyldige rader og lar brukeren bekrefte", async () => {
    render(<BulkListingImport open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Velg importfil"), {
      target: { files: [new File(["data"], "annonser.csv", { type: "text/csv" })] },
    });
    expect(await screen.findByText("2 gyldige · 0 ugyldige")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Opprett annonser" }));
    expect(screen.getByText(/Du er i ferd med å opprette 2 annonser/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Bekreft oppretting" }));
    await waitFor(() =>
      expect(mutate).toHaveBeenCalledWith(expect.objectContaining({ rows: expect.any(Array) })),
    );
  });

  it("søker gjennom hele kategoritreet og velger en underkategori som mal", async () => {
    render(<BulkListingImport open onOpenChange={vi.fn()} />);
    const trigger = screen.getByRole("combobox", { name: "Mal for kategori" });
    expect(trigger.textContent).toContain("Alle kategorier");

    fireEvent.click(trigger);
    // Hovedkategorien viser hvor bred malen blir.
    expect(screen.getByText("1 underkategorier")).toBeTruthy();
    // Skjulte kategorier er ikke plukkbare for vanlige proff-brukere.
    expect(screen.queryByText("E2E-testkategori")).toBeNull();

    // Søket treffer et nivå ned uten at brukeren må bore seg dit.
    fireEvent.change(screen.getByPlaceholderText("Søk i kategorier …"), {
      target: { value: "ski" },
    });
    expect(screen.queryByText("Sykler")).toBeNull();
    fireEvent.click(screen.getByText("Ski"));

    await waitFor(() => expect(trigger.textContent).toContain("Sport og friluft › Ski"));
  });
});
