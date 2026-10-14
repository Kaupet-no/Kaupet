import { describe, expect, it } from "vitest";

import { isPrivateNetworkHost } from "./use-should-show-dev-server-switch";

describe("isPrivateNetworkHost", () => {
  it("godtar Android-loopback som lokal dev-server (KG-38-F01)", () => {
    expect(isPrivateNetworkHost("127.0.0.1:3000")).toBe(true);
    expect(isPrivateNetworkHost("localhost:3000")).toBe(true);
    expect(isPrivateNetworkHost("192.168.1.20:3000")).toBe(true);
  });

  it("avviser offentlige verter", () => {
    expect(isPrivateNetworkHost("kaupet.no")).toBe(false);
    expect(isPrivateNetworkHost("127example.com")).toBe(false);
  });
});
