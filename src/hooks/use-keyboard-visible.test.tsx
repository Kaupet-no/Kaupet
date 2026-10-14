// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  let resolveImport!: () => void;
  const imported = new Promise<void>((resolve) => {
    resolveImport = resolve;
  });
  return { addListener: vi.fn(), imported, resolveImport: () => resolveImport() };
});

vi.mock("@/lib/native", () => ({ nativePlatform: () => "ios" }));
// Importen av pluginet løses først når testen sier fra (sen dynamisk import).
vi.mock("@capacitor/keyboard", async () => {
  await mocks.imported;
  return { Keyboard: { addListener: mocks.addListener } };
});

import { useKeyboardVisible } from "./use-keyboard-visible";

afterEach(cleanup);

describe("useKeyboardVisible", () => {
  it("registrerer ingen lyttere når importen fullføres etter unmount (KG-37-F03)", async () => {
    const { unmount } = renderHook(() => useKeyboardVisible());
    unmount();

    await act(async () => {
      mocks.resolveImport();
      await mocks.imported;
      await new Promise((r) => setTimeout(r, 0));
    });

    expect(mocks.addListener).not.toHaveBeenCalled();
  });
});
