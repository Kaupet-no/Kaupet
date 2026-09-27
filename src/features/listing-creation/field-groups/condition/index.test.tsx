// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { Condition } from ".";

afterEach(() => cleanup());

describe("Condition", () => {
  it("viser tilstandsvalgene som en radiogruppe av rader, ikke en nedtrekksliste", () => {
    const setValue = vi.fn();
    render(
      <Condition
        setValue={setValue as unknown as WizardSharedProps["setValue"]}
        condition={null}
        isVehicle={false}
        categoryId=""
        categories={[]}
      />,
    );

    const group = screen.getByRole("radiogroup", { name: "Tilstand" });
    const options = screen.getAllByRole("radio");
    expect(options).toHaveLength(5);
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(group.querySelector("select")).toBeNull();

    const good = screen.getByRole("radio", { name: /Pent brukt/ });
    expect(good.getAttribute("aria-checked")).toBe("false");
    fireEvent.click(good);
    expect(setValue).toHaveBeenCalledWith("condition", "good", { shouldValidate: true });
  });

  it("markerer valgt tilstand med aria-checked", () => {
    render(
      <Condition
        setValue={vi.fn() as unknown as WizardSharedProps["setValue"]}
        condition="new"
        isVehicle={false}
        categoryId=""
        categories={[]}
      />,
    );

    expect(screen.getByRole("radio", { name: /Helt ny/ }).getAttribute("aria-checked")).toBe(
      "true",
    );
  });
});
