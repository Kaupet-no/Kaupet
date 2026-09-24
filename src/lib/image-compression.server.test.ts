import { describe, expect, it } from "vitest";

import {
  compressListingImageOnServer,
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

  it("beholder originalen hvis den er mindre enn alle komprimerte forsøk", async () => {
    const original = bytesOfSize(50_000); // allerede lite WebP
    const transformer = new FakeTransformer([
      bytesOfSize(80_000), // hovedbilde-forsøk, større enn original
      bytesOfSize(60_000), // thumb-forsøk, større enn original
    ]);

    const result = await compressListingImageOnServer(original, "image/webp", transformer);

    expect(result.main.bytes).toBe(original);
    expect(result.thumb.bytes).toBe(original);
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
