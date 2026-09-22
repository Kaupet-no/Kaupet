import { createHash, createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  getVippsWebhookEventId,
  getVippsWebhookRejectionReason,
  isFreshVippsWebhookDate,
  verifyVippsWebhookSignature,
} from "./vipps.server";

const secret =
  "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";
const body = '{"some-unique-content":"ee6e441b-cc4a-46f8-895d-a5af79bcc233/hello-world"}';
const date = "Thu, 30 Mar 2023 08:38:32 GMT";
const pathAndQuery = "/e2cee29b-012e-4f1d-8ef4-e95fd74a7a63";
const host = "webhook.site";
const contentHash = createHash("sha256").update(body).digest("base64");
const canonicalAuthorization =
  "HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=u4zz3dyO3c3xJwl36rPpn1n7WF75u6r2epjH70MZTGM=";

function signedAuthorization(
  s = secret,
  overrides: Partial<{
    method: string;
    pathAndQuery: string;
    date: string;
    host: string;
    contentHash: string;
  }> = {},
) {
  const request = {
    method: "POST",
    pathAndQuery,
    date,
    host,
    contentHash,
    ...overrides,
  };
  const signed = `${request.method}\n${request.pathAndQuery}\n${request.date};${request.host};${request.contentHash}`;
  return `HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=${createHmac("sha256", s).update(signed).digest("base64")}`;
}

function request(
  overrides: Partial<{
    method: string;
    pathAndQuery: string;
    date: string;
    host: string;
    contentHash: string;
    authorization: string;
    rawBody: string;
  }> = {},
) {
  return {
    method: "POST",
    pathAndQuery,
    host,
    date,
    contentHash,
    authorization: canonicalAuthorization,
    rawBody: body,
    ...overrides,
  };
}

describe("verifyVippsWebhookSignature", () => {
  it("accepts Vipps' canonical fields with a fixed independently computed signature", () => {
    expect(verifyVippsWebhookSignature(secret, request())).toBe(true);
  });

  it("rejects a signature computed with the wrong secret", () => {
    expect(
      verifyVippsWebhookSignature(secret, {
        ...request(),
        authorization: signedAuthorization("wrong-secret"),
      }),
    ).toBe(false);
  });

  it("rejects a signature computed over a tampered body", () => {
    expect(
      verifyVippsWebhookSignature(secret, {
        ...request(),
        rawBody: `${body} `,
      }),
    ).toBe(false);
  });

  it("rejects a changed path, date, or signature", () => {
    expect(
      verifyVippsWebhookSignature(secret, {
        ...request(),
        pathAndQuery: `${pathAndQuery}?replayed=true`,
      }),
    ).toBe(false);
    expect(
      verifyVippsWebhookSignature(secret, {
        ...request(),
        date: "Thu, 30 Mar 2023 08:38:33 GMT",
      }),
    ).toBe(false);
    expect(verifyVippsWebhookSignature(secret, { ...request(), authorization: "" })).toBe(false);
  });
});

describe("getVippsWebhookRejectionReason", () => {
  it("returns null for a valid request", () => {
    expect(getVippsWebhookRejectionReason(secret, request())).toBeNull();
  });

  it("returns content_hash_mismatch for a tampered body", () => {
    expect(getVippsWebhookRejectionReason(secret, { ...request(), rawBody: `${body} ` })).toBe(
      "content_hash_mismatch",
    );
  });

  it("returns unsupported_authorization for a non-HMAC-SHA256 scheme", () => {
    expect(
      getVippsWebhookRejectionReason(secret, { ...request(), authorization: "Bearer sometoken" }),
    ).toBe("unsupported_authorization");
  });

  it("returns missing_signature when the signature is empty", () => {
    expect(
      getVippsWebhookRejectionReason(secret, {
        ...request(),
        authorization: "HMAC-SHA256 SignedHeaders=x-ms-date;host;x-ms-content-sha256&Signature=",
      }),
    ).toBe("missing_signature");
  });

  it("returns signature_mismatch for a signature computed with the wrong secret", () => {
    expect(
      getVippsWebhookRejectionReason(secret, {
        ...request(),
        authorization: signedAuthorization("wrong-secret"),
      }),
    ).toBe("signature_mismatch");
  });
});

describe("Vipps webhook replay protection", () => {
  const now = Date.parse("2026-09-22T12:00:00.000Z");

  it("uses Vipps' stable pspReference when eventId is absent", () => {
    expect(getVippsWebhookEventId({ pspReference: "psp-123" })).toBe("psp-123");
  });

  it("prefers the protocol identity over legacy IDs", () => {
    expect(getVippsWebhookEventId({ pspReference: "psp-123", eventId: "legacy-id" })).toBe(
      "psp-123",
    );
  });

  it("does not manufacture an event identity", () => {
    expect(getVippsWebhookEventId({ reference: "ref-123", name: "AUTHORIZED" })).toBeNull();
  });

  it("accepts a fresh signed request date", () => {
    expect(isFreshVippsWebhookDate("Tue, 22 Sep 2026 11:57:00 GMT", now)).toBe(true);
  });

  it("rejects an old or invalid signed request date", () => {
    expect(isFreshVippsWebhookDate("Tue, 22 Sep 2026 11:54:59 GMT", now)).toBe(false);
    expect(isFreshVippsWebhookDate("not-a-date", now)).toBe(false);
  });
});
