// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { AdPickerOptions } from "./ad-picker-options";

afterEach(cleanup);

describe("AdPickerOptions", () => {
  it("offers both ad flows with their descriptions", () => {
    const onSell = vi.fn();
    const onBuy = vi.fn();
    const { getByRole } = render(<AdPickerOptions onSell={onSell} onBuy={onBuy} />);

    const sell = getByRole("button", { name: /jeg selger eller gir bort noe/i });
    const buy = getByRole("button", { name: /jeg ønsker å kjøpe noe/i });

    expect(sell.getAttribute("aria-describedby")).toBe("sell-ad-description");
    expect(buy.getAttribute("aria-describedby")).toBe("buy-ad-description");

    fireEvent.click(sell);
    fireEvent.click(buy);

    expect(onSell).toHaveBeenCalledOnce();
    expect(onBuy).toHaveBeenCalledOnce();
  });
});
