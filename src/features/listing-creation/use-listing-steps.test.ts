// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import type { FieldGroup } from "./field-groups/registry";
import { useListingSteps, type WizardPage } from "./use-listing-steps";

function pages(...keys: string[]): WizardPage[] {
  return keys.map((key) => ({
    groups: [{ key } as unknown as FieldGroup],
  }));
}

describe("useListingSteps", () => {
  it("beholder aktivt feltgruppesteg når en side settes inn foran det", () => {
    const initialPages = pages("photos", "details", "review");
    const { result, rerender } = renderHook(({ currentPages }) => useListingSteps(currentPages), {
      initialProps: { currentPages: initialPages },
    });

    act(() => result.current.setStep(2));
    rerender({ currentPages: pages("photos", "category-confirm", "details", "review") });

    expect(result.current.step).toBe(3);
    expect(result.current.currentPage?.groups[0]?.key).toBe("details");
  });
});
