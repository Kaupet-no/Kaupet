import { beforeEach, describe, expect, it, vi } from "vitest";

const { images } = vi.hoisted(() => ({ images: { input: vi.fn() } }));
vi.mock("cloudflare:workers", () => ({ env: { IMAGES: images } }));

import {
  compressListingImageOnServer,
  CloudflareImagesTransformer,
  ImageDecodeError,
  ImagesUnavailableError,
  type ImageTransformer,
  type TransformInput,
} from "@/lib/image-compression.server";
import { PRESETS } from "@/lib/image-presets";
import { MAX_FILE_BYTES } from "@/lib/storage";

function bytesOfSize(n: number): Uint8Array {
  return new Uint8Array(n);
}

const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function bindOutput(output: Promise<{ response: () => Response }> | { response: () => Response }) {
  const outputMock = vi.fn(() => Promise.resolve(output));
  images.input.mockReturnValue({
    transform: () => ({ output: outputMock }),
  });
  return outputMock;
}

function webpResponse(bytes = WEBP_BYTES, init: ResponseInit = {}) {
  return new Response(bytes, {
    headers: { "content-type": "image/webp" },
    ...init,
  });
}

class CloudflareImagesError extends Error {
  constructor(
    readonly code: number,
    message = "provider detail",
  ) {
    super(message);
  }
}

beforeEach(() => images.input.mockReset());

/** Fake transformer som lar hver test styre hva som returneres per kall, og
 * registrerer alle input-parametre (bredde/høyde, kvalitet) den ble kalt
 * med, slik at vi kan verifisere at server-komprimeringen faktisk ber om
 * samme dimensjoner/format som veiviserens PRESETS. */
class FakeTransformer implements ImageTransformer {
  calls: TransformInput[] = [];
  private results: Array<Uint8Array | Error>;
  private i = 0;

  constructor(results: Array<Uint8Array | Error>) {
    this.results = results;
  }

  async transform(input: TransformInput) {
    this.calls.push(input);
    const next = this.results[Math.min(this.i, this.results.length - 1)];
    this.i += 1;
    if (next instanceof Error) throw next;
    return { bytes: next, contentType: "image/webp" };
  }
}

describe("compressListingImageOnServer", () => {
  it("ber transformeren om listing-preset sine dimensjoner/kvalitet for hovedbildet", async () => {
    const original = bytesOfSize(6 * 1024 * 1024); // stort JPEG, f.eks. 4000x3000/6MB
    const transformer = new FakeTransformer([
      bytesOfSize(400_000), // under listing.maxSizeMB (0.6MB) på første forsøk
      bytesOfSize(60_000), // thumb, under listing-thumb.maxSizeMB (0.1MB)
    ]);

    const result = await compressListingImageOnServer(original, "image/jpeg", transformer);

    expect(transformer.calls[0]).toMatchObject({
      maxWidthOrHeight: PRESETS.listing.maxWidthOrHeight,
      quality: Math.round(PRESETS.listing.initialQuality * 100),
    });
    expect(transformer.calls[1]).toMatchObject({
      maxWidthOrHeight: PRESETS["listing-thumb"].maxWidthOrHeight,
      quality: Math.round(PRESETS["listing-thumb"].initialQuality * 100),
    });
    expect(result.main.contentType).toBe("image/webp");
    expect(result.thumb.contentType).toBe("image/webp");
    expect(result.transformations).toBe(2);
  });

  it("lagrer beste resultat selv om måltørrelsen ikke nås etter maks forsøk (ingen feil)", async () => {
    const original = bytesOfSize(6 * 1024 * 1024);
    // Begge hovedbilde-forsøkene havner over listing.maxSizeMB (0.6MB), men
    // andre forsøk (lavere kvalitet) er mindre enn første — det skal velges.
    const transformer = new FakeTransformer([
      bytesOfSize(900_000),
      bytesOfSize(700_000),
      bytesOfSize(90_000), // thumb, ett forsøk, under grensen
    ]);

    const result = await compressListingImageOnServer(original, "image/jpeg", transformer);

    expect(result.main.bytes.byteLength).toBe(700_000);
    expect(result.main.bytes.byteLength).toBeLessThanOrEqual(MAX_FILE_BYTES);
    expect(result.transformations).toBe(3);
  });

  it("bruker aldri mer enn 3 transformasjoner totalt (hovedbilde + thumb)", async () => {
    const original = bytesOfSize(6 * 1024 * 1024);
    const transformer = new FakeTransformer([
      bytesOfSize(900_000),
      bytesOfSize(890_000),
      bytesOfSize(200_000),
    ]);

    const result = await compressListingImageOnServer(original, "image/jpeg", transformer);

    expect(transformer.calls.length).toBeLessThanOrEqual(3);
    expect(result.transformations).toBeLessThanOrEqual(3);
  });

  it("velger transformert WebP selv om originalen er mindre", async () => {
    const original = bytesOfSize(50_000); // allerede lite WebP
    const transformer = new FakeTransformer([
      bytesOfSize(80_000), // hovedbilde-forsøk, større enn original
      bytesOfSize(60_000), // thumb-forsøk, større enn original
    ]);

    const result = await compressListingImageOnServer(original, "image/webp", transformer);

    expect(result.main.bytes).not.toBe(original);
    expect(result.main.contentType).toBe("image/webp");
    expect(result.thumb.contentType).toBe("image/webp");
    expect(result.main.bytes.byteLength).toBe(80_000);
    expect(result.thumb.bytes.byteLength).toBe(60_000);
  });

  it("kaster ImageDecodeError uendret videre fra transformerens første forsøk (skadet bilde)", async () => {
    const original = bytesOfSize(1000);
    const transformer = new FakeTransformer([new ImageDecodeError("ugyldig bilde")]);

    await expect(
      compressListingImageOnServer(original, "image/jpeg", transformer),
    ).rejects.toBeInstanceOf(ImageDecodeError);
  });

  it("kaster ImagesUnavailableError uendret videre (Cloudflare Images-binding mangler)", async () => {
    const original = bytesOfSize(1000);
    const transformer = new FakeTransformer([new ImagesUnavailableError()]);

    await expect(
      compressListingImageOnServer(original, "image/jpeg", transformer),
    ).rejects.toBeInstanceOf(ImagesUnavailableError);
  });
});

describe("CloudflareImagesTransformer", () => {
  const transformer = new CloudflareImagesTransformer();
  const input = {
    bytes: WEBP_BYTES,
    contentType: "image/webp",
    maxWidthOrHeight: 100,
    quality: 80,
  };

  it("accepts only a nonempty RIFF/WebP response", async () => {
    bindOutput({ response: () => webpResponse() });
    await expect(transformer.transform(input)).resolves.toMatchObject({
      contentType: "image/webp",
      bytes: WEBP_BYTES,
    });
  });

  it.each([401, 403, 429, 500])(
    "treats HTTP %s as an internal retryable failure",
    async (status) => {
      bindOutput({ response: () => new Response("error", { status }) });
      await expect(transformer.transform(input)).rejects.not.toBeInstanceOf(ImageDecodeError);
    },
  );

  it("rejects a non-WebP MIME and cancels its body", async () => {
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(WEBP_BYTES);
        },
        cancel,
      }),
      { headers: { "content-type": "text/html" } },
    );
    bindOutput({ response: () => response });
    await expect(transformer.transform(input)).rejects.toThrow();
    expect(cancel).toHaveBeenCalled();
  });

  it("rejects a WebP MIME with invalid RIFF bytes", async () => {
    bindOutput({ response: () => webpResponse(new Uint8Array([1, 2, 3])) });
    await expect(transformer.transform(input)).rejects.toThrow("ugyldige WebP");
  });

  it("rejects output over 5 MiB", async () => {
    bindOutput({ response: () => webpResponse(new Uint8Array(5 * 1024 * 1024 + 1)) });
    await expect(transformer.transform(input)).rejects.toThrow("size limit");
  });

  it.each([9412, 9413, 9520])("treats Cloudflare Images code %s as a bad image", async (code) => {
    bindOutput(Promise.reject(new CloudflareImagesError(code, "secret provider message")));
    await expect(transformer.transform(input)).rejects.toMatchObject({
      name: "ImageDecodeError",
      message: "Bildet kunne ikke dekodes",
    });
  });

  it.each([9523, 9422, 9432, 9999])(
    "treats Cloudflare Images code %s as an internal failure",
    async (code) => {
      bindOutput(Promise.reject({ code, message: "provider detail" }));
      await expect(transformer.transform(input)).rejects.not.toBeInstanceOf(ImageDecodeError);
    },
  );

  it("does not infer a bad image from an error message", async () => {
    bindOutput(Promise.reject(new Error("unsupported image")));
    await expect(transformer.transform(input)).rejects.not.toBeInstanceOf(ImageDecodeError);
  });

  it("enforces the deadline and cancels a late response", async () => {
    vi.useFakeTimers();
    let resolveOutput!: (value: { response: () => Response }) => void;
    bindOutput(
      new Promise((resolve) => {
        resolveOutput = resolve;
      }),
    );
    const pending = transformer.transform(input);
    const rejection = expect(pending).rejects.toThrow("deadline");
    await vi.advanceTimersByTimeAsync(15_000);
    await rejection;
    const cancel = vi.fn();
    resolveOutput({
      response: () =>
        new Response(new ReadableStream<Uint8Array>({ cancel }), {
          headers: { "content-type": "image/webp" },
        }),
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(cancel).toHaveBeenCalled();
    vi.useRealTimers();
  });
});
