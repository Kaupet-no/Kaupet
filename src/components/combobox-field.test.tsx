// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComboboxMultiContent } from "./combobox-field";

afterEach(cleanup);

const options = [
  { value: "alpha", label_nb: "Alpha" },
  { value: "beta", label_nb: "Beta" },
];

describe("ComboboxMultiContent – skjermlesertilstand (KG-36-F01)", () => {
  it("eksponerer faktisk valg som avkrysningsbokser, ikke som listbox-alternativer", () => {
    const { getByRole, queryByRole } = render(
      <ComboboxMultiContent values={["beta"]} options={options} onToggle={vi.fn()} />,
    );

    // Chromium på Android ignorerer aria-checked på role="option".
    expect(queryByRole("option")).toBeNull();
    expect(getByRole("checkbox", { name: "Alpha" }).getAttribute("aria-checked")).toBe("false");
    expect(getByRole("checkbox", { name: "Beta" }).getAttribute("aria-checked")).toBe("true");
  });

  it("veksler valg og filtrerer på søketeksten", () => {
    const onToggle = vi.fn();
    const { getByRole, queryByRole } = render(
      <ComboboxMultiContent values={[]} options={options} onToggle={onToggle} />,
    );

    fireEvent.click(getByRole("checkbox", { name: "Alpha" }));
    expect(onToggle).toHaveBeenCalledWith("alpha");

    fireEvent.change(getByRole("searchbox"), { target: { value: "bet" } });
    expect(queryByRole("checkbox", { name: "Alpha" })).toBeNull();
    expect(getByRole("checkbox", { name: "Beta" })).toBeTruthy();
  });

  it("legger til fritekst med knapp eller Enter, og Enter på eksakt treff veksler alternativet", () => {
    const onToggle = vi.fn();
    const { getByRole } = render(
      <ComboboxMultiContent values={[]} options={options} onToggle={onToggle} />,
    );
    const input = getByRole("searchbox");

    fireEvent.change(input, { target: { value: " Gamma " } });
    fireEvent.click(getByRole("button", { name: "Legg til «Gamma»" }));
    expect(onToggle).toHaveBeenLastCalledWith("Gamma");
    expect((input as HTMLInputElement).value).toBe("");

    fireEvent.change(input, { target: { value: "Delta" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToggle).toHaveBeenLastCalledWith("Delta");

    fireEvent.change(input, { target: { value: "beta" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onToggle).toHaveBeenLastCalledWith("beta");
  });
});
