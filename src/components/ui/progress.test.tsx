// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { Progress } from "./progress";

afterEach(cleanup);

describe("Progress (KG-36-F02)", () => {
  it("annonserer kjent fremdrift", () => {
    const { getByRole } = render(<Progress value={50} />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBe("50");
    expect(bar.getAttribute("data-state")).toBe("loading");
  });

  it("er ubestemt uten value", () => {
    const { getByRole } = render(<Progress />);
    const bar = getByRole("progressbar");
    expect(bar.getAttribute("aria-valuenow")).toBeNull();
    expect(bar.getAttribute("data-state")).toBe("indeterminate");
  });
});
