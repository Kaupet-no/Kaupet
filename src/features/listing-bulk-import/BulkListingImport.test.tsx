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

/** Ekte react-query-oppførsel er unødvendig her: denne dobbelen kjører
 * `mutationFn` og ruter resultatet til `onSuccess`/`onError` synkront nok til
 * at `waitFor` fanger opp det, uten en `QueryClientProvider`. Brukes av både
 * `createImport`- og `previewImport`-mutasjonen i komponenten. */
vi.mock("@tanstack/react-query", () => ({
  useMutation: (options: {
    mutationFn: (variables: unknown) => unknown;
    onSuccess?: (data: unknown) => void;
    onError?: (error: Error) => void;
  }) => {
    const mutate = vi.fn((variables: unknown) => {
      Promise.resolve(options.mutationFn(variables)).then(options.onSuccess, options.onError);
    });
    return { isPending: false, mutate, reset: vi.fn() };
  },
}));
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/annonse">{children}</a>,
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
vi.mock("@/hooks/use-user-roles", () => ({ useIsDemo: () => ({ data: false }) }));
vi.mock("@/hooks/use-category-filters", () => ({
  useAllCategoryFilters: () => ({ data: [] }),
}));
vi.mock("./ImportHistory", () => ({
  ImportHistory: ({ organizationId }: { organizationId: string }) => (
    <div data-testid="import-history">Historikk for {organizationId}</div>
  ),
}));

const parsedRows = [
  {
    rowNumber: 2,
    externalId: "id-1",
    category: "sykler",
    title: "En sykkel",
    description: "Dette er en god beskrivelse av varen.",
    priceNok: 4500,
    imageUrls: [] as string[],
    attributes: {},
  },
  {
    rowNumber: 3,
    externalId: "id-2",
    category: "sykler",
    title: "En annen sykkel",
    description: "Dette er en annen god beskrivelse av varen.",
    priceNok: 3200,
    imageUrls: [] as string[],
    attributes: {},
  },
];

vi.mock("./parse-import-file", () => ({
  attributeMetaFromFilters: () => ({}),
  parseImportFile: vi.fn(async () => ({
    fileName: "annonser.csv",
    rows: parsedRows,
    errors: [],
  })),
}));

/** Fanger opp begge `createListingsFromImport`-kallene (dry-run-forhåndsvisning
 * og selve importen) og svarer ulikt basert på `dryRun`, slik testene kan
 * verifisere modusvalg og statusetiketter uten en ekte server. */
const createListingsFromImportMock = vi.fn(
  ({ data }: { data: { dryRun?: boolean; mode: string } }) => {
    if (data.dryRun) {
      return Promise.resolve([
        {
          rowNumber: 2,
          externalId: "id-1",
          status: data.mode === "create" ? "created" : "updated",
        },
        { rowNumber: 3, externalId: "id-2", status: "duplicate" },
      ]);
    }
    return Promise.resolve([
      { rowNumber: 2, externalId: "id-1", status: "created", kaupetCode: "12345678" },
      { rowNumber: 3, externalId: "id-2", status: "duplicate" },
    ]);
  },
);
vi.mock("./listing-bulk-import.functions", () => ({
  createListingsFromImport: (args: { data: { dryRun?: boolean; mode: string } }) =>
    createListingsFromImportMock(args),
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

const location = {
  id: "33333333-3333-4333-8333-333333333333",
  name: "Hovedlokasjon",
  address_line: null,
  postal_code: null,
  city: null,
};

async function uploadFile() {
  fireEvent.change(screen.getByLabelText("Velg importfil"), {
    target: { files: [new File(["data"], "annonser.csv", { type: "text/csv" })] },
  });
  await screen.findByText("2 gyldige · 0 ugyldige");
}

describe("BulkListingImport", () => {
  beforeEach(() => {
    createListingsFromImportMock.mockClear();
  });

  it("kjører dry-run automatisk etter en gyldig fil og viser statusetiketter per rad", async () => {
    render(<BulkListingImport open onOpenChange={vi.fn()} locations={[location]} />);
    await uploadFile();

    // Automatisk dry-run i standardmodus (upsert).
    await waitFor(() =>
      expect(createListingsFromImportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dryRun: true, mode: "upsert" }),
        }),
      ),
    );
    expect(await screen.findByText("Oppdateres")).toBeTruthy();
    expect(screen.getByText("Finnes allerede")).toBeTruthy();
  });

  it("kjører dry-run på nytt når modus endres, og oppsummerer i bekreftelsesdialogen", async () => {
    render(<BulkListingImport open onOpenChange={vi.fn()} locations={[location]} />);
    await uploadFile();
    await screen.findByText("Oppdateres");

    fireEvent.click(screen.getByRole("radio", { name: /Kun nye annonser/ }));

    await waitFor(() =>
      expect(createListingsFromImportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ dryRun: true, mode: "create" }),
        }),
      ),
    );
    // I create-modus mapper doblen id-1 til "created" (vist som "Ny").
    expect(await screen.findByText("Ny")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Start import" }));
    expect(screen.getAllByText(/1 nye, 1 finnes allerede/).length).toBeGreaterThan(0);
  });

  it("sender valgt modus når importen bekreftes, og viser resultatet", async () => {
    render(<BulkListingImport open onOpenChange={vi.fn()} locations={[location]} />);
    await uploadFile();
    await screen.findByText("Oppdateres");

    fireEvent.click(screen.getByRole("button", { name: "Start import" }));
    fireEvent.click(screen.getByRole("button", { name: "Bekreft import" }));

    await waitFor(() =>
      expect(createListingsFromImportMock).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ mode: "upsert", rows: parsedRows }),
        }),
      ),
    );
    expect(await screen.findByText("Import ferdig")).toBeTruthy();
  });

  it("viser Siste importer med organisasjonens historikk i startvisningen", () => {
    render(
      <BulkListingImport
        open
        onOpenChange={vi.fn()}
        locations={[location]}
        organizationId="org-1"
      />,
    );
    expect(screen.getByText("Historikk for org-1")).toBeTruthy();
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
