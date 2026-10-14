// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";

import { defaultAdvancedSearchValue } from "@/lib/advanced-search-value";
import { AdvancedSearchSheet } from "./advanced-search-sheet";

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: null }) }));
vi.mock("@/components/attribute-fields", () => ({
  useAllCategoryFilters: () => ({
    data: [
      {
        key: "equipment",
        label_nb: "Utstyr",
        options: [
          { value: "camera", label_nb: "Kamera" },
          { value: "roof", label_nb: "Soltak" },
        ],
      },
      { key: "color", label_nb: "Farge", options: [{ value: "red", label_nb: "Rød" }] },
    ],
  }),
}));
vi.mock("@/features/listing-search/use-retain-category-attributes", () => ({
  useRetainCategoryAttributes: () => ({
    retain: () => ({ kept: {}, dropped: [], droppedLabels: [] }),
    categoryNotice: [],
    changeCategories: () => ({}),
  }),
}));
vi.mock("@/components/location-filter", () => ({
  LocationPicker: () => null,
  RadiusPicker: () => null,
}));
vi.mock("@/components/ui/responsive-overlay", () => ({
  ResponsiveOverlay: ({ open, children }: { open: boolean; children: ReactNode }) =>
    open ? <div>{children}</div> : null,
  ResponsiveOverlayContent: ({ children }: { children: ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/components/ui/dialog", () => ({
  DialogHeader: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogFooter: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children: ReactNode }) => <h2>{children}</h2>,
  DialogDescription: ({ children }: { children: ReactNode }) => <p>{children}</p>,
}));
vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    disconnect() {}
  },
);
afterEach(cleanup);

it.each(["multiselect", "exclude"] as const)(
  "beholder andre %s-valg når én brikke fjernes",
  (kind) => {
    const onApply = vi.fn();
    const { getByRole, queryByRole } = render(
      <AdvancedSearchSheet
        open
        onOpenChange={vi.fn()}
        categories={[]}
        onApply={onApply}
        initial={{
          ...defaultAdvancedSearchValue(),
          attributes: { equipment: { kind, values: ["camera", "roof"] } },
        }}
      />,
    );
    const prefix = kind === "exclude" ? "Ikke " : "";
    fireEvent.click(getByRole("button", { name: `Fjern Utstyr: ${prefix}Kamera` }));
    expect(getByRole("button", { name: `Fjern Utstyr: ${prefix}Soltak` })).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Bruk søk" }));
    expect(onApply.mock.calls[0][0].attributes).toEqual({ equipment: { kind, values: ["roof"] } });
    fireEvent.click(getByRole("button", { name: `Fjern Utstyr: ${prefix}Soltak` }));
    expect(queryByRole("button", { name: `Fjern Utstyr: ${prefix}Soltak` })).toBeNull();
    fireEvent.click(getByRole("button", { name: "Bruk søk" }));
    expect(onApply.mock.calls[1][0].attributes).toEqual({});
  },
);

it("nullstiller alle egenskaper i samme handling", () => {
  const onApply = vi.fn();
  const { getByRole } = render(
    <AdvancedSearchSheet
      open
      onOpenChange={vi.fn()}
      categories={[]}
      onApply={onApply}
      initial={{
        ...defaultAdvancedSearchValue(),
        attributes: {
          equipment: { kind: "multiselect", values: ["camera"] },
          color: { kind: "select", value: "red" },
        },
      }}
    />,
  );
  fireEvent.click(getByRole("button", { name: "Nullstill alle" }));
  fireEvent.click(getByRole("button", { name: "Bruk søk" }));
  expect(onApply.mock.calls[0][0].attributes).toEqual({});
});
