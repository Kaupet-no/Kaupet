import { describe, expect, it, vi, beforeEach } from "vitest";
import { androidNavigationUrl } from "./dev-server-url";
import * as nativeModule from "@/lib/native";

vi.mock("@/lib/native");

const mockedNativePlatform = vi.mocked(nativeModule.nativePlatform);

describe("androidNavigationUrl", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("maps localhost to 127.0.0.1 on Android", () => {
    mockedNativePlatform.mockReturnValue("android");

    const url = new URL("http://localhost:3000");
    const result = androidNavigationUrl(url);

    expect(result.hostname).toBe("127.0.0.1");
    expect(result.port).toBe("3000");
    expect(result.protocol).toBe("http:");
  });

  it("leaves localhost unchanged on iOS", () => {
    mockedNativePlatform.mockReturnValue("ios");

    const url = new URL("http://localhost:3000");
    const result = androidNavigationUrl(url);

    expect(result.hostname).toBe("localhost");
    expect(result.port).toBe("3000");
  });

  it("leaves localhost unchanged on web", () => {
    mockedNativePlatform.mockReturnValue("web");

    const url = new URL("http://localhost:3000");
    const result = androidNavigationUrl(url);

    expect(result.hostname).toBe("localhost");
    expect(result.port).toBe("3000");
  });

  it("does not mutate the original URL", () => {
    mockedNativePlatform.mockReturnValue("android");

    const url = new URL("http://localhost:3000");
    const originalHostname = url.hostname;
    androidNavigationUrl(url);

    expect(url.hostname).toBe(originalHostname);
  });

  it("leaves private IPs unchanged on Android", () => {
    mockedNativePlatform.mockReturnValue("android");

    const url = new URL("http://192.168.1.23:3000");
    const result = androidNavigationUrl(url);

    expect(result.hostname).toBe("192.168.1.23");
  });
});
