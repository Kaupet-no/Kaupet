// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { interpretedSearchState } from "./submit-search";
import { useSearchInterpretation } from "./use-search-interpretation";

let navigationState: object;
vi.mock("@tanstack/react-router", () => ({
  useLocation: ({ select }: { select: (location: { state: object }) => unknown }) =>
    select({ state: navigationState }),
}));
afterEach(cleanup);

it("tilstandsovergang: erstatter tolkningen ved et nytt søk uten remount, også med tom tolkning", () => {
  const category = { kind: "category", slug: "bil", source: "text" } as const;
  navigationState = interpretedSearchState([category]);
  const { result, rerender } = renderHook(() => useSearchInterpretation());
  expect(result.current[0]).toEqual([category]);

  const price = { kind: "price", max: 1000, source: "text" } as const;
  navigationState = interpretedSearchState([price]);
  rerender();
  expect(result.current[0]).toEqual([price]);

  navigationState = interpretedSearchState();
  rerender();
  expect(result.current[0]).toEqual([]);
});

it("beholder lokale tolkninger og fjerninger ved filter- og fanebytter uten ny tolkning", () => {
  navigationState = {};
  const { result, rerender } = renderHook(() => useSearchInterpretation());
  const price = { kind: "price", max: 1000, source: "text" } as const;
  act(() => result.current[1]([price]));
  navigationState = {};
  rerender();
  expect(result.current[0]).toEqual([price]);

  act(() => result.current[1]([]));
  rerender();
  expect(result.current[0]).toEqual([]);
});
