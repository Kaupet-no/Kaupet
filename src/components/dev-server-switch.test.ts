import { describe, expect, it } from "vitest";

import { localDevServerUrl } from "@/lib/dev-server-url";

describe("localDevServerUrl", () => {
  it.each([
    ["localhost:3000", "http://localhost:3000/"],
    ["192.168.1.23:3000", "http://192.168.1.23:3000/"],
    ["10.0.0.4:5173", "http://10.0.0.4:5173/"],
    ["172.16.0.4:8080", "http://172.16.0.4:8080/"],
  ])("accepts %s", (address, expected) => {
    expect(localDevServerUrl(address)?.href).toBe(expected);
  });

  it.each([
    "example.com:3000",
    "8.8.8.8:3000",
    "192.168.1.23",
    "192.168.1.23:0",
    "192.168.1.23:99999",
    "javascript:alert(1)",
    "192.168.1.999:3000",
  ])("rejects %s", (address) => {
    expect(localDevServerUrl(address)).toBeNull();
  });
});
