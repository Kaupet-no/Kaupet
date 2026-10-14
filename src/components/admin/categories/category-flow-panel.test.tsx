// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  flows: [] as Array<{
    id: string;
    category_id: string;
    field_groups: string[];
    sort_order: number;
  }>,
  flowsError: null as unknown,
  upsert: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const query: Record<string, unknown> = {};
      let categoryId: unknown;
      for (const method of ["select", "order"]) query[method] = () => query;
      query.eq = (_column: string, value: unknown) => {
        categoryId = value;
        return query;
      };
      query.maybeSingle = async () => ({
        data: db.flowsError ? null : (db.flows.find((f) => f.category_id === categoryId) ?? null),
        error: db.flowsError,
      });
      query.upsert = db.upsert;
      query.then = (resolve: (value: unknown) => unknown) =>
        resolve(
          table === "categories"
            ? {
                data: [
                  { id: "parent", parent_id: null },
                  { id: "child", parent_id: "parent" },
                ],
                error: null,
              }
            : { data: db.flowsError ? null : db.flows, error: db.flowsError },
        );
      return query;
    },
  },
}));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock("@/components/ui/dialog", () => ({
  DialogFooter: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { CategoryFlowPanel } from "./category-flow-panel";

const child = { id: "child", parent_id: "parent", name_nb: "Barn" } as never;
const vehicleFlow = [
  "vehicle-registration",
  "photos",
  "vehicle-facts",
  "vehicle-condition",
  "category-attributes",
  "price",
  "description-keywords",
  "location",
  "review-publish",
];

function renderPanel() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <CategoryFlowPanel category={child} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  db.flows = [{ id: "f1", category_id: "parent", field_groups: vehicleFlow, sort_order: 0 }];
  db.flowsError = null;
  db.upsert.mockReset().mockResolvedValue({ error: null });
});
afterEach(cleanup);

// KG-11-F01: et uendret lagre erstattet arvet kjøretøyflyt med standardflyten.
it("lagrer den arvede flyten når underkategorien ikke har egen flyt", async () => {
  renderPanel();
  const save = await screen.findByRole("button", { name: "Lagre" });
  await waitFor(() => expect((save as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(save);
  await waitFor(() => expect(db.upsert).toHaveBeenCalled());
  const groups = db.upsert.mock.calls[0][0].field_groups as string[];
  expect(groups).toEqual(
    expect.arrayContaining(["vehicle-registration", "vehicle-facts", "vehicle-condition"]),
  );
});

it("blokkerer lagring når flytene ikke kunne hentes", async () => {
  db.flowsError = new Error("Databasen er nede");
  renderPanel();
  await screen.findByText("Databasen er nede");
  expect((screen.getByRole("button", { name: "Lagre" }) as HTMLButtonElement).disabled).toBe(true);
});
