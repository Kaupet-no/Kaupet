// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ComboboxMultiContent } from "./combobox-field";

// cmdk observerer listehøyden; jsdom har ingen ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;
Element.prototype.scrollIntoView = vi.fn();

afterEach(cleanup);

describe("ComboboxMultiContent – skjermlesertilstand (KG-36-F01)", () => {
  it("annonserer faktisk valg med aria-checked, uavhengig av aktiv rad", () => {
    const { getByRole, getAllByRole } = render(
      <ComboboxMultiContent
        values={["beta"]}
        options={[
          { value: "alpha", label_nb: "Alpha" },
          { value: "beta", label_nb: "Beta" },
        ]}
        onToggle={vi.fn()}
      />,
    );

    expect(getByRole("listbox").hasAttribute("aria-multiselectable")).toBe(false);
    const [alpha, beta] = getAllByRole("option");
    expect(alpha.getAttribute("aria-checked")).toBe("false");
    expect(beta.getAttribute("aria-checked")).toBe("true");
  });
});
