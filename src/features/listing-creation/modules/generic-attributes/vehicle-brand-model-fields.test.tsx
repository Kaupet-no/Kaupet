// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { VehicleModelMultiComboboxContent } from "./vehicle-brand-model-fields";

vi.mock("@/lib/vehicle/vehicle-brands", () => ({
  useAllVehicleBrands: () => ({ data: [] }),
  useAllVehicleModels: () => ({ data: [] }),
  useAllVehicleModelClasses: () => ({ data: [] }),
}));
afterEach(cleanup);

const groups = {
  groups: [
    {
      classId: "c3",
      className: "3-serie",
      options: [
        { value: "320d", label: "320d" },
        { value: "330e", label: "330e" },
      ],
    },
  ],
  ungrouped: [{ value: "i3", label: "i3" }],
};

function renderList(values: string[], onChange = vi.fn(), onToggleAll = vi.fn()) {
  render(
    <VehicleModelMultiComboboxContent
      categoryGroup="bil"
      brandNames={["BMW"]}
      options={[...groups.groups[0].options, ...groups.ungrouped]}
      groups={groups}
      values={values}
      onChange={onChange}
      counts={{ "320d": 4 }}
      selectAllLabel="BMW (alle)"
      onToggleAll={onToggleAll}
    />,
  );
  return { onChange, onToggleAll };
}

describe("VehicleModelMultiComboboxContent – skjermlesertilstand (KG-36-F01)", () => {
  it("eksponerer modeller, klasse-(Alle) og velg alle som avkrysningsbokser i grupper", () => {
    renderList(["320d", "330e"]);

    expect(screen.queryByRole("option")).toBeNull();
    expect(screen.getByRole("group", { name: "3-serie" })).toBeTruthy();
    const checked = (name: string) =>
      screen.getByRole("checkbox", { name }).getAttribute("aria-checked");
    expect(checked("3-serie (Alle)")).toBe("true");
    expect(checked("320d (4)")).toBe("true");
    expect(checked("i3")).toBe("false");
    expect(checked("BMW (alle)")).toBe("false");
  });

  it("veksler modell, hele klassen og velg alle", () => {
    const { onChange, onToggleAll } = renderList(["320d"]);

    fireEvent.click(screen.getByRole("checkbox", { name: "i3" }));
    expect(onChange).toHaveBeenLastCalledWith(["320d", "i3"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "3-serie (Alle)" }));
    expect(onChange).toHaveBeenLastCalledWith(["320d", "330e"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "BMW (alle)" }));
    expect(onToggleAll).toHaveBeenCalled();
  });

  it("filtrerer på søk og skjuler grupper uten treff", () => {
    renderList([]);

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "i3" } });
    expect(screen.queryByRole("group", { name: "3-serie" })).toBeNull();
    expect(screen.getByRole("checkbox", { name: "i3" })).toBeTruthy();

    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "x5" } });
    expect(screen.getByText("Ingen modeller funnet.")).toBeTruthy();
  });
});
