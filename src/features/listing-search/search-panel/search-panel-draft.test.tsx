// @vitest-environment jsdom
import type { HTMLAttributes, ReactNode, SetStateAction } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { AdvancedSearchValue } from "@/components/advanced-search-value";
import { defaultAdvancedSearchValue } from "@/components/advanced-search-value";
import { submitSearch } from "@/features/listing-search/submit-search";
import { SearchPanel } from "./search-panel";

vi.mock("vaul", () => ({
  Drawer: {
    Root: ({ children }: { children: ReactNode }) => <>{children}</>,
    Portal: ({ children }: { children: ReactNode }) => <>{children}</>,
    Overlay: (props: HTMLAttributes<HTMLDivElement>) => <div {...props} />,
    Content: ({ children }: { children: ReactNode }) => <div>{children}</div>,
    Title: ({ children }: { children: ReactNode }) => <>{children}</>,
  },
}));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }));
vi.mock("@/components/advanced-search-sheet", () => ({ SaveSearchDialog: () => null }));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/hooks/use-form-factor", () => ({ useFormFactor: () => "phone" }));
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
vi.mock("@/features/listing-search/use-draft-result-count", () => ({
  useDraftResultCount: () => ({ count: 7, isPending: false }),
}));
vi.mock("@/features/listing-search/submit-search", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/features/listing-search/submit-search")>();
  return {
    ...original,
    resolveAppliedSearch: vi.fn(async ({ applied, query }) => ({
      applied: {
        ...applied,
        value: { ...applied.value, terms: query?.trim().split(/\s+/).filter(Boolean) ?? [] },
      },
      criteria: [],
    })),
  };
});
vi.mock("@/features/listing-search/search-panel/filter-sections", () => ({
  SearchFilterSections: ({
    setValue,
  }: {
    setValue: (next: SetStateAction<AdvancedSearchValue>) => void;
  }) => (
    <>
      <button type="button" onClick={() => setValue((value) => ({ ...value, min: 100 }))}>
        Endre prisutkast
      </button>
      <button
        type="button"
        onClick={() => setValue((value) => ({ ...value, categories: ["sykkel"] }))}
      >
        Endre kategoriutkast
      </button>
    </>
  ),
}));

afterEach(cleanup);

describe("SearchPanel", () => {
  it("beholder flere endringer som utkast og committer URL-en én gang ved Vis treff", () => {
    const commitUrl = vi.fn();

    render(
      <SearchPanel
        open
        onOpenChange={() => {}}
        categories={[]}
        allFilters={[]}
        initialSection="categories"
        results={{
          applied: { value: defaultAdvancedSearchValue(), attributes: {} },
          onApply: (applied) => void submitSearch({ applied, commit: commitUrl }),
          resultCount: 42,
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Endre prisutkast" }));
    fireEvent.click(screen.getByRole("button", { name: "Endre kategoriutkast" }));
    expect(commitUrl).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Vis 7 annonser" }));
    expect(commitUrl).toHaveBeenCalledOnce();
    expect(commitUrl).toHaveBeenCalledWith(
      expect.objectContaining({ min: 100, categories: ["sykkel"] }),
    );
  });
  it("sender query fra resultatpanelet som anvendt state", async () => {
    const onApply = vi.fn();

    render(
      <SearchPanel
        open
        onOpenChange={() => {}}
        categories={[]}
        allFilters={[]}
        initialSection="query"
        results={{
          applied: { value: defaultAdvancedSearchValue(), attributes: {} },
          onApply,
          resultCount: 42,
        }}
      />,
    );

    const input = screen.getByRole("searchbox", { name: "Søk i annonser" });
    fireEvent.change(input, { target: { value: "sykkel" } });
    fireEvent.click(screen.getByRole("button", { name: "Søk etter «sykkel»" }));

    await waitFor(() => expect(onApply).toHaveBeenCalledOnce());
    expect(onApply).toHaveBeenCalledWith(
      expect.objectContaining({
        value: expect.objectContaining({ terms: ["sykkel"] }),
      }),
      expect.any(Array),
    );
  });
});
