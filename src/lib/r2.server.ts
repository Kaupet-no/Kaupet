// Tynt lag over Cloudflare R2 sitt S3-kompatible API. Vi bruker det vanlige
// S3-endepunktet (`https://<account>.r2.cloudflarestorage.com`) i stedet for
// worker-bindinger, slik at samme kodevei virker i dev (Vite uten Nitro),
// vitest, CI og produksjon. Se AGENTS.md/PR-historikk for begrunnelsen.
import { AwsClient } from "aws4fetch";

export { publicImageUrl } from "./image-url";

/** BILDER er den offentlige bucketen (annonsebilder m.m.), VEDLEGG er privat
 * (meldingsvedlegg m.m.). */
export type R2BucketName = "BILDER" | "VEDLEGG";

function readEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Miljøvariabelen "${name}" mangler. Sett den i .env (se .env.example).`);
  }
  return value;
}

function getBucketName(bucket: R2BucketName): string {
  return readEnv(bucket === "BILDER" ? "R2_BILDER_BUCKET" : "R2_VEDLEGG_BUCKET");
}

let _client: AwsClient | undefined;

function getClient(): AwsClient {
  if (!_client) {
    _client = new AwsClient({
      accessKeyId: readEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: readEnv("R2_SECRET_ACCESS_KEY"),
      service: "s3",
      region: "auto",
    });
  }
  return _client;
}

function objectUrl(bucket: R2BucketName, key: string): string {
  const accountId = readEnv("R2_ACCOUNT_ID");
  return `https://${accountId}.r2.cloudflarestorage.com/${getBucketName(bucket)}/${key}`;
}

export async function putObject(
  bucket: R2BucketName,
  key: string,
  body: ArrayBuffer | ArrayBufferView | ReadableStream | Blob,
  contentType: string,
): Promise<void> {
  const response = await getClient().fetch(objectUrl(bucket, key), {
    method: "PUT",
    body: body as BodyInit,
    headers: { "content-type": contentType },
  });
  if (!response.ok) {
    throw new Error(
      `Klarte ikke å laste opp til R2 (${bucket}/${key}): ${response.status} ${response.statusText}`,
    );
  }
}

/** Presignert GET-URL (samme modell som Supabase sin `createSignedUrls`) —
 * bæreren av URL-en har tilgang fram til utløp, så kall denne kun etter at
 * autorisasjon er sjekket server-side. */
export async function presignGetUrl(
  bucket: R2BucketName,
  key: string,
  expiresInSeconds: number,
): Promise<string> {
  const url = `${objectUrl(bucket, key)}?X-Amz-Expires=${expiresInSeconds}`;
  const signed = await getClient().sign(url, { method: "GET", aws: { signQuery: true } });
  return signed.url;
}

export async function deleteObject(bucket: R2BucketName, key: string): Promise<void> {
  const response = await getClient().fetch(objectUrl(bucket, key), { method: "DELETE" });
  // R2 svarer 204 selv om objektet ikke fantes, så vi trenger ingen 404-sjekk her.
  if (!response.ok) {
    throw new Error(
      `Klarte ikke å slette fra R2 (${bucket}/${key}): ${response.status} ${response.statusText}`,
    );
  }
}
