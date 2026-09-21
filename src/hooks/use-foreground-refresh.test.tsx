// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ addListener: vi.fn() }));

vi.mock("@/lib/native", () => ({ isNative: () => true }));
vi.mock("@capacitor/app", () => ({ App: { addListener: mocks.addListener } }));

import { useForegroundRefresh } from "./use-foreground-refresh";

afterEach(() => {
  cleanup();
  mocks.addListener.mockReset();
});

describe("useForegroundRefresh", () => {
  it("fjerner native-listeneren hvis registreringen fullføres etter unmount", async () => {
    let resolveRegistration!: (handle: { remove: () => Promise<void> }) => void;
    const registration = new Promise<{ remove: () => Promise<void> }>((resolve) => {
      resolveRegistration = resolve;
    });
    mocks.addListener.mockReturnValue(registration);

    const { unmount } = renderHook(() => useForegroundRefresh(vi.fn(), true));
    await waitFor(() => expect(mocks.addListener).toHaveBeenCalledTimes(1));
    unmount();

    const remove = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      resolveRegistration({ remove });
      await registration;
    });

    expect(remove).toHaveBeenCalledOnce();
  });
});
