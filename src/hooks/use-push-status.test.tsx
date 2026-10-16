// @vitest-environment jsdom
import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getPrefs: vi.fn(), updatePrefs: vi.fn() }));
vi.mock("@tanstack/react-start", () => ({
  useServerFn: (fn: string) => (fn === "get" ? mocks.getPrefs : mocks.updatePrefs),
}));
vi.mock("@/lib/push.functions", () => ({
  getNotificationPreferences: "get",
  updateNotificationPreferences: "update",
}));
vi.mock("@/lib/push", () => ({
  getCurrentEndpoint: async () => "https://push.example/1",
  getPermissionState: () => "granted",
  pushSupported: () => true,
  subscribe: async () => undefined,
}));
vi.mock("@/lib/native-push", () => ({
  getCurrentNativeToken: async () => null,
  getNativePermissionState: async () => "default",
  nativePushSupported: () => false,
  subscribeNative: async () => undefined,
}));
vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));

import { usePushStatus } from "./use-push-status";

// KG-25-F01: «Slå på» sendte tre felt og ble avvist av serverens tifeltsskjema.
it("slår på én varseltype uten å sende eller nullstille de andre", async () => {
  mocks.getPrefs.mockResolvedValue({ web_push_messages: false, email_messages: true });
  mocks.updatePrefs.mockResolvedValue({ ok: true });
  const client = new QueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const { result } = renderHook(() => usePushStatus(), { wrapper });
  await waitFor(() => expect(result.current.loading).toBe(false));
  await act(() => result.current.enableOnThisDevice("messages"));
  expect(mocks.updatePrefs).toHaveBeenCalledWith({ data: { web_push_messages: true } });
});
