// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

afterEach(cleanup);

const orderMock = vi.fn();
const limitMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const fromMock = vi.fn();
const imageJobsInMock = vi.fn();
const imageJobsSelectMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { ImportHistory } from "./ImportHistory";

function row(
  overrides: Partial<{
    import_id: string;
    source: string;
    status: string;
    created_at: string;
    listing_id: string | null;
  }>,
) {
  return {
    import_id: "import-1",
    source: "excel",
    status: "created",
    created_at: "2026-09-24T10:00:00.000Z",
    listing_id: null,
    ...overrides,
  };
}

function mockRows(rows: ReturnType<typeof row>[]) {
  limitMock.mockResolvedValue({ data: rows, error: null });
}

function mockImageJobs(
  rows: { listing_id: string; status: string; customer_error: string | null }[],
) {
  imageJobsInMock.mockResolvedValue({ data: rows, error: null });
}

beforeEach(() => {
  fromMock.mockReset();
  selectMock.mockReset();
  eqMock.mockReset();
  orderMock.mockReset();
  limitMock.mockReset();
  imageJobsInMock.mockReset();
  imageJobsSelectMock.mockReset();
  imageJobsSelectMock.mockImplementation(() => ({ in: imageJobsInMock }));
  mockImageJobs([]);
  fromMock.mockImplementation((table: string) =>
    table === "listing_image_jobs" ? { select: imageJobsSelectMock } : { select: selectMock },
  );
  selectMock.mockImplementation(() => ({ eq: eqMock }));
  eqMock.mockImplementation(() => ({ order: orderMock }));
  orderMock.mockImplementation(() => ({ limit: limitMock }));
});

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("ImportHistory", () => {
  it("grupperer rader per import_id og viser antall per status", async () => {
    mockRows([
      row({ import_id: "import-2", status: "created", created_at: "2026-09-24T11:00:00.000Z" }),
      row({ import_id: "import-2", status: "created", created_at: "2026-09-24T11:00:00.000Z" }),
      row({ import_id: "import-2", status: "failed", created_at: "2026-09-24T11:00:01.000Z" }),
      row({ import_id: "import-1", status: "updated", created_at: "2026-09-24T09:00:00.000Z" }),
    ]);
    render(<ImportHistory organizationId="org-1" />, { wrapper });

    await waitFor(() => expect(fromMock).toHaveBeenCalledWith("organization_listing_imports"));
    expect(await screen.findByText(/Opprettet: 2/)).toBeTruthy();
    expect(screen.getByText(/Feilet: 1/)).toBeTruthy();
    expect(screen.getByText(/Oppdatert: 1/)).toBeTruthy();
    expect(screen.getAllByText("Excel").length).toBe(2);
  });

  it("viser en tomtilstand når organisasjonen ikke har noen importer", async () => {
    mockRows([]);
    render(<ImportHistory organizationId="org-1" />, { wrapper });
    expect(await screen.findByText("Ingen importer ennå")).toBeTruthy();
  });

  it("viser en feilmelding når spørringen feiler", async () => {
    limitMock.mockResolvedValue({ data: null, error: new Error("boom") });
    render(<ImportHistory organizationId="org-1" />, { wrapper });
    expect(await screen.findByText(/Importhistorikken kunne ikke lastes/)).toBeTruthy();
  });

  it("viser bildestatus (behandles/feilet, kun customer_error-tekster) per kjøring", async () => {
    mockRows([
      row({ listing_id: "listing-1" }),
      row({ listing_id: "listing-2", status: "updated" }),
    ]);
    mockImageJobs([
      { listing_id: "listing-1", status: "pending", customer_error: null },
      { listing_id: "listing-1", status: "processing", customer_error: null },
      {
        listing_id: "listing-2",
        status: "failed",
        customer_error: "Bildet finnes ikke på adressen (HTTP 404).",
      },
    ]);
    render(<ImportHistory organizationId="org-1" />, { wrapper });

    expect(await screen.findByText(/Bilder behandles: 2/)).toBeTruthy();
    expect(screen.getByText(/Bilder feilet: 1/)).toBeTruthy();
    expect(screen.getByText("Bildet finnes ikke på adressen (HTTP 404).")).toBeTruthy();
  });
});
