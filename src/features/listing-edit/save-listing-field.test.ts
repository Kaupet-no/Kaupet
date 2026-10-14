import { beforeEach, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({
  current: {} as Record<string, unknown>,
  updatedRows: [{ id: "listing-1" }] as unknown[],
  update: vi.fn(),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => {
      const query: Record<string, unknown> = {};
      query.select = () => query;
      query.eq = () => query;
      query.single = async () => ({ data: { attributes: db.current }, error: null });
      query.update = (value: unknown) => {
        db.update(value);
        return {
          eq: () => ({ select: async () => ({ data: db.updatedRows, error: null }) }),
        };
      };
      return query;
    },
  },
}));

import { saveListingField } from "./save-listing-field";

const behavior = { requiresDeliveryMethod: true } as never;

beforeEach(() => {
  db.current = { color: "red", seats: 5, vehicle_lookup: "{}" };
  db.updatedRows = [{ id: "listing-1" }];
  db.update.mockReset();
});

// KG-22-F01: et tømt felt ble lagt tilbake av sammenslåingen med databasen.
it("fjerner tømte attributter og beholder andre panelers nøkler", async () => {
  await saveListingField(
    "listing-1",
    { group: "attributes", attributes: { seats: 7 }, removedKeys: ["color"] },
    { behavior },
  );
  expect(db.update).toHaveBeenCalledWith({ attributes: { seats: 7, vehicle_lookup: "{}" } });
});

// KG-22-F03: en UPDATE som ikke traff noen rad ble meldt som lagret.
it("feiler når oppdateringen ikke traff annonsen", async () => {
  db.updatedRows = [];
  await expect(
    saveListingField("listing-1", { group: "title", title: "Ny tittel" }, { behavior }),
  ).rejects.toThrow("Endringen ble ikke lagret");
});
