import { describe, expect, it } from "vitest";
import { isSupportedWebPushEndpoint, isValidWebPushKeys } from "./web-push-validation";

const p256dh = Buffer.from(
  "046b17d1f2e12c4247f8bce6e563a440f277037d812deb33a0f4a13945d898c2964fe342e2fe1a7f9b8ee7eb4a7c0f9e162bce33576b315ececbb6406837bf51f5",
  "hex",
).toString("base64url");
const auth = Buffer.alloc(16, 1).toString("base64url");

describe("Web Push destination and keys", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/token?opaque=1",
    "https://updates.push.services.mozilla.com/wpush/v1/token",
    "https://web.push.apple.com/Qw/opaque",
    "https://db3.notify.windows.com/w/?token=opaque",
  ])("accepts supported provider endpoint %s", (endpoint) => {
    expect(isSupportedWebPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/path",
    "https://fcm.googleapis.com.evil.test/path",
    "https://user@fcm.googleapis.com/path",
    "https://fcm.googleapis.com\\\\@127.0.0.1/path",
    "https://nested.host.push.apple.com/path",
    "https://fcm.googleapis.com:444/path",
    "https://127.0.0.1/path",
    "https://localhost/path",
    "https://updates.push.services.mozilla.com/path#fragment",
    " https://fcm.googleapis.com/path",
  ])("rejects unsafe endpoint %s", (endpoint) => {
    expect(isSupportedWebPushEndpoint(endpoint)).toBe(false);
  });

  it("requires a decodable P-256 point and a 16-byte auth secret", async () => {
    await expect(isValidWebPushKeys(p256dh, auth)).resolves.toBe(true);
    await expect(isValidWebPushKeys(`${p256dh.slice(0, -1)}A`, auth)).resolves.toBe(false);
    await expect(isValidWebPushKeys(Buffer.alloc(65, 1).toString("base64url"), auth)).resolves.toBe(
      false,
    );
    await expect(isValidWebPushKeys(p256dh, "short")).resolves.toBe(false);
  });
});
