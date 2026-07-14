import { createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import { verifyVippsWebhookSignature } from "./vipps.server";

const secret = "shared-secret";
const body = JSON.stringify({ reference: "ref-1", name: "epayments.payment.authorized.v1" });

function sign(s: string, b: string) {
  return createHmac("sha256", s).update(b).digest("base64");
}

describe("verifyVippsWebhookSignature", () => {
  it("accepts a correctly signed body", () => {
    expect(verifyVippsWebhookSignature(secret, sign(secret, body), body)).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    expect(verifyVippsWebhookSignature(secret, sign("wrong-secret", body), body)).toBe(false);
  });

  it("rejects a signature computed over a tampered body", () => {
    const tampered = JSON.stringify({ reference: "ref-1", name: "epayments.payment.cancelled.v1" });
    expect(verifyVippsWebhookSignature(secret, sign(secret, body), tampered)).toBe(false);
  });

  it("rejects an empty signature header", () => {
    expect(verifyVippsWebhookSignature(secret, "", body)).toBe(false);
  });
});
