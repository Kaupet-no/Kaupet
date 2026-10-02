import { beforeEach, describe, expect, it, vi } from "vitest";

const { adminRpc, fromMock, transformMock, putObjectMock, events } = vi.hoisted(() => ({
  adminRpc: vi.fn(),
  fromMock: vi.fn(),
  transformMock: vi.fn(),
  putObjectMock: vi.fn(),
  events: [] as string[],
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown }) => unknown) | undefined;
    const fn = (input: { data: unknown }) => handler!({ data: validator(input.data) });
    Object.assign(fn, {
      middleware: () => fn,
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: adminRpc, from: fromMock },
}));
vi.mock("@/lib/r2.server", () => ({
  putObject: (...args: unknown[]) => {
    events.push("put");
    return putObjectMock(...args);
  },
  deleteObject: vi.fn(),
}));
vi.mock("@/lib/to-client-error", () => ({
  ClientError: class ClientError extends Error {
    constructor(
      message: string,
      readonly status = 400,
    ) {
      super(message);
    }
  },
  toClientError: async (_name: string, error: Error) => error,
}));
vi.mock("@/lib/request-ip.server", () => ({
  hashRequestIp: vi.fn().mockResolvedValue("hashed-ip"),
}));
vi.mock("@/lib/image-compression.server", () => ({
  CloudflareImagesTransformer: class {
    transform() {
      return transformMock();
    }
  },
  ImageDecodeError: class ImageDecodeError extends Error {},
  ImagesUnavailableError: class ImagesUnavailableError extends Error {},
}));

import { uploadVehicle360Frame } from "./vehicle-360.functions";

const LISTING_ID = "11111111-1111-1111-1111-111111111111";
const TOKEN = "a-token-with-at-least-thirty-two-characters";
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

beforeEach(() => {
  vi.clearAllMocks();
  events.length = 0;
  transformMock.mockImplementation(() => {
    throw new Error("Cloudflare Images må ikke brukes for 360-opptak");
  });
  adminRpc.mockImplementation(() => {
    events.push("reservation");
    return Promise.resolve({ data: LISTING_ID, error: null });
  });
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    upsert: () => Promise.resolve({ error: null }),
  };
  fromMock.mockReturnValue(chain);
});

import {
  hasValid360MagicBytes,
  MAX_360_BASE64_CHARS,
  MAX_360_FRAME_BYTES,
} from "./vehicle-360.functions";

describe("vehicle 360 upload validation", () => {
  it("keeps the encoded payload ceiling aligned with the decoded byte ceiling", () => {
    expect(MAX_360_BASE64_CHARS).toBe(Math.ceil(MAX_360_FRAME_BYTES / 3) * 4);
  });

  it.each([
    ["image/jpeg", [0xff, 0xd8, 0xff, 0xe0]],
    ["image/png", [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]],
    ["image/webp", [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]],
  ])("accepts valid %s signatures", (mime, bytes) => {
    expect(hasValid360MagicBytes(Uint8Array.from(bytes), mime)).toBe(true);
  });

  it("rejects spoofed and truncated image signatures", () => {
    expect(hasValid360MagicBytes(Uint8Array.from([0xff, 0xd8]), "image/jpeg")).toBe(false);
    expect(hasValid360MagicBytes(Uint8Array.from([0x89, 0x50, 0x4e]), "image/png")).toBe(false);
    expect(hasValid360MagicBytes(new TextEncoder().encode("RIFFxxxxNOPE"), "image/webp")).toBe(
      false,
    );
  });

  it.each([
    ["image/jpeg", JPEG, "jpg"],
    ["image/png", PNG, "png"],
    ["image/webp", WEBP, "webp"],
  ])(
    "reserves the capture slot before storing the original %s bytes",
    async (contentType, bytes, ext) => {
      const base64Data = Buffer.from(bytes).toString("base64");
      const result = await uploadVehicle360Frame({
        data: { token: TOKEN, frameOrder: 7, contentType, base64Data },
      });

      expect(result).toEqual({ ok: true });
      expect(events.indexOf("reservation")).toBeLessThan(events.indexOf("put"));
      expect(putObjectMock).toHaveBeenCalledWith(
        "BILDER",
        `${LISTING_ID}/7.${ext}`,
        Buffer.from(bytes),
        contentType,
      );
      expect(transformMock).not.toHaveBeenCalled();
    },
  );

  it("does not reach R2 when token or slot reservation fails", async () => {
    adminRpc.mockResolvedValueOnce({ data: null, error: null });
    await expect(
      uploadVehicle360Frame({
        data: {
          token: TOKEN,
          frameOrder: 0,
          contentType: "image/jpeg",
          base64Data: Buffer.from(JPEG).toString("base64"),
        },
      }),
    ).rejects.toThrow("Opptaksøkten er utløpt");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects invalid magic bytes before R2", async () => {
    await expect(
      uploadVehicle360Frame({
        data: {
          token: TOKEN,
          frameOrder: 0,
          contentType: "image/jpeg",
          base64Data: Buffer.from("not an image").toString("base64"),
        },
      }),
    ).rejects.toThrow("samsvarer ikke");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects decoded payloads above the byte limit before R2", async () => {
    await expect(
      uploadVehicle360Frame({
        data: {
          token: TOKEN,
          frameOrder: 0,
          contentType: "image/jpeg",
          base64Data: Buffer.concat([
            Buffer.from(JPEG),
            Buffer.alloc(MAX_360_FRAME_BYTES + 1 - JPEG.byteLength),
          ]).toString("base64"),
        },
      }),
    ).rejects.toThrow("Bildet er for stort");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("rejects invalid tokens before slot reservation or R2", async () => {
    expect(() =>
      uploadVehicle360Frame({
        data: {
          token: "short",
          frameOrder: 0,
          contentType: "image/jpeg",
          base64Data: Buffer.from(JPEG).toString("base64"),
        },
      }),
    ).toThrow();
    expect(adminRpc).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });
});
