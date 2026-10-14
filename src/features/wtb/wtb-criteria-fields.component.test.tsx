// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const filters = [
  {
    id: "b",
    category_id: "bil",
    key: "brand",
    label_nb: "Merke",
    type: "brand_select",
    unit: "bil",
  },
  {
    id: "m",
    category_id: "bil",
    key: "model",
    label_nb: "Modell",
    type: "model_select",
    unit: null,
  },
].map((f) => ({ options: null, sort_order: 0, is_primary: false, depends_on_key: null, ...f }));

vi.mock("@/components/attribute-fields", () => ({
  useAllCategoryFilters: () => ({ data: filters }),
}));
vi.mock("./use-attribute-bounds", () => ({
  useAttributeRangeBounds: () => ({ data: undefined }),
  dynamicBoundsForFilter: () => undefined,
}));
vi.mock(
  "@/features/listing-creation/modules/generic-attributes/vehicle-brand-model-fields",
  () => ({
    VehicleBrandField: ({ onChange }: { onChange: (v: string) => void }) => (
      <button type="button" onClick={() => onChange("Audi")}>
        Velg Audi
      </button>
    ),
    VehicleModelWithClassField: () => null,
  }),
);

import { WtbCriteriaFields } from "./wtb-criteria-fields";

afterEach(cleanup);

// KG-23-F02: «BMW 320» ble til «Audi 320» fordi modellen ble stående.
it("fjerner modellen når merket byttes", () => {
  const onChange = vi.fn();
  const onCheckedKeysChange = vi.fn();
  render(
    <WtbCriteriaFields
      categoryId="bil"
      categories={[{ id: "bil", parent_id: null }]}
      value={{ brand: "BMW", model: "320" }}
      onChange={onChange}
      checkedKeys={["brand", "model"]}
      onCheckedKeysChange={onCheckedKeysChange}
    />,
  );
  fireEvent.click(screen.getByRole("button", { name: "Velg Audi" }));
  expect(onChange).toHaveBeenCalledWith({ brand: "Audi" });
  expect(onCheckedKeysChange).toHaveBeenCalledWith(["brand"]);
});
