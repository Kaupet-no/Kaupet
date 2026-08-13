import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  checkPermissions: vi.fn(),
}));

vi.mock("./native", () => ({
  isNative: () => true,
  nativePlatform: () => "android",
}));
vi.mock("./push.functions", () => ({
  savePushSubscription: vi.fn(),
  deletePushSubscription: vi.fn(),
}));
vi.mock("@capacitor/push-notifications", () => ({
  PushNotifications: { checkPermissions: mocks.checkPermissions },
}));

import { getNativePermissionState } from "./native-push";

describe("getNativePermissionState", () => {
  beforeEach(() => {
    mocks.checkPermissions.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("behandler feil fra native-pluginen som manglende støtte", async () => {
    mocks.checkPermissions.mockRejectedValue(new TypeError("plugin failed"));

    await expect(getNativePermissionState()).resolves.toBe("unsupported");
  });
});
