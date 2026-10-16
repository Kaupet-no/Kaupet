// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListingLoadError } from "./listing-load-error";

afterEach(cleanup);

describe("ListingLoadError (KG-35-F03)", () => {
  it("viser norsk feil og prøver på nytt", () => {
    const onRetry = vi.fn();
    const { getByRole, getByText } = render(
      <ListingLoadError error={new Error("Failed to fetch")} onRetry={onRetry} />,
    );
    expect(getByRole("alert")).toBeTruthy();
    expect(getByText("Kunne ikke laste annonsen")).toBeTruthy();
    fireEvent.click(getByRole("button", { name: "Prøv på nytt" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
