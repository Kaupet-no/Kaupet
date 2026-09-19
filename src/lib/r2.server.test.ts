import { beforeEach, describe, expect, it, vi } from "vitest";

const { fetchMock } = vi.hoisted(() => ({ fetchMock: vi.fn() }));

vi.mock("aws4fetch", () => ({
  AwsClient: class {
    fetch = fetchMock;
  },
}));

function listResponse(keys: string[], nextToken?: string) {
  return {
    ok: true,
    text: async () =>
      `<?xml version="1.0"?><ListBucketResult>` +
      keys.map((k) => `<Contents><Key>${k}</Key></Contents>`).join("") +
      `<IsTruncated>${nextToken ? "true" : "false"}</IsTruncated>` +
      (nextToken ? `<NextContinuationToken>${nextToken}</NextContinuationToken>` : "") +
      `</ListBucketResult>`,
  };
}

describe("deletePrefix", () => {
  beforeEach(async () => {
    vi.resetModules();
    fetchMock.mockReset();
    process.env.R2_ACCOUNT_ID = "konto";
    process.env.R2_BILDER_BUCKET = "kaupet-bilder";
    process.env.R2_ACCESS_KEY_ID = "id";
    process.env.R2_SECRET_ACCESS_KEY = "hemmelig";
  });

  it("følger pagineringen og sletter hver nøkkel under prefikset", async () => {
    const { deletePrefix } = await import("./r2.server");
    fetchMock
      .mockResolvedValueOnce(listResponse(["annonse/a.jpg", "annonse/a-thumb.jpg"], "token-1"))
      .mockResolvedValueOnce(listResponse(["annonse/0.jpg"]))
      .mockResolvedValue({ ok: true, status: 204, statusText: "No Content" });

    await expect(deletePrefix("BILDER", "annonse/")).resolves.toBe(3);

    const deleted = fetchMock.mock.calls
      .filter(([, init]) => init?.method === "DELETE")
      .map(([url]) => String(url));
    expect(deleted).toEqual([
      "https://konto.r2.cloudflarestorage.com/kaupet-bilder/annonse/a.jpg",
      "https://konto.r2.cloudflarestorage.com/kaupet-bilder/annonse/a-thumb.jpg",
      "https://konto.r2.cloudflarestorage.com/kaupet-bilder/annonse/0.jpg",
    ]);
  });

  // Et tomt prefiks ville listet og slettet hele bucketen.
  it("nekter tomt prefiks uten å røre R2", async () => {
    const { deletePrefix } = await import("./r2.server");
    await expect(deletePrefix("BILDER", "")).rejects.toThrow(/ikke-tomt prefiks/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("stopper hvis listingen feiler, i stedet for å melde alt slettet", async () => {
    const { deletePrefix } = await import("./r2.server");
    fetchMock.mockResolvedValueOnce({ ok: false, status: 403, statusText: "Forbidden" });
    await expect(deletePrefix("BILDER", "annonse/")).rejects.toThrow(/Klarte ikke å liste/);
  });

  // Et svar med HTTP 200 som likevel ikke er et ListBucketResult (uventet
  // format, feilside) skal ikke tolkes som et tomt prefiks — da ville
  // deletePrefix returnert 0 og køraden blitt slettet uten at objektene
  // noensinne ble fjernet fra R2.
  it("kaster hvis svaret er HTTP 200 men ikke et gyldig ListBucketResult", async () => {
    const { deletePrefix } = await import("./r2.server");
    fetchMock.mockResolvedValueOnce({ ok: true, text: async () => "<html>ikke S3-XML</html>" });
    await expect(deletePrefix("BILDER", "annonse/")).rejects.toThrow(/ikke et gyldig/);
  });

  // Grensen fiksen over ikke skal flytte: et legitimt tomt prefiks er
  // fortsatt et gyldig ListBucketResult uten <Contents>, og skal fortsatt gi
  // 0 uten å kaste.
  it("gir 0 uten å kaste for et gyldig, tomt ListBucketResult", async () => {
    const { deletePrefix } = await import("./r2.server");
    fetchMock.mockResolvedValueOnce(listResponse([]));
    await expect(deletePrefix("BILDER", "annonse/")).resolves.toBe(0);
  });
});
