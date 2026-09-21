// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { useIsNative } from "./use-is-native";

vi.mock("@/lib/native", () => ({ isNative: () => true }));

describe("useIsNative", () => {
  it("er true allerede i første render (ingen web-layout-frame)", () => {
    const seen: boolean[] = [];
    function Probe() {
      seen.push(useIsNative());
      return null;
    }
    render(<Probe />);
    expect(seen[0]).toBe(true);
  });
});
