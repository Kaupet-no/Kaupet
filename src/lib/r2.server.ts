// Tynt lag over Cloudflare R2 sitt S3-kompatible API. Vi bruker det vanlige
// S3-endepunktet (`https://<account>.r2.cloudflarestorage.com`) i stedet for
// worker-bindinger, slik at samme kodevei virker i dev (Vite uten Nitro),
// vitest, CI og produksjon. Se AGENTS.md/PR-historikk for begrunnelsen.
import { AwsClient } from "aws4fetch";

/** BILDER er den offentlige bucketen (annonsebilder m.m.), VEDLEGG er privat
 * (meldingsvedlegg m.m.). */
export type R2BucketName = "BILDER" | "VEDLEGG";

export class PrefixDeleteError extends Error {
  constructor(
    cause: unknown,
    readonly attemptedObjects: number,
    readonly deletedObjects: number,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "PrefixDeleteError";
  }
}

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

function bucketUrl(bucket: R2BucketName): string {
  const accountId = readEnv("R2_ACCOUNT_ID");
  return `https://${accountId}.r2.cloudflarestorage.com/${getBucketName(bucket)}`;
}

function objectUrl(bucket: R2BucketName, key: string): string {
  const segments = key.split("/");
  if (
    !key ||
    key.includes("\\") ||
    key.includes("%") ||
    /[?#]/.test(key) ||
    [...key].some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127) ||
    segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Ugyldig R2-objektnøkkel");
  }
  return `${bucketUrl(bucket)}/${segments.map(encodeURIComponent).join("/")}`;
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

/** Alle nøkler under et prefiks, paginert (S3 gir maks 1000 per svar).
 *
 * R2 svarer med S3-XML. Nøklene vi lager er alltid `{uuid}/{uuid}.{ext}`
 * eller `{uuid}/{tall}.{ext}` (se storage.functions.ts og
 * vehicle-360.functions.ts), altså aldri tegn som XML-escapes — derfor
 * plukker vi dem ut med et regex fremfor å dra inn en XML-parser.
 *
 * Regexet finner ingenting både når prefikset faktisk er tomt OG når svaret
 * ikke er det vi tror (uventet format, navnerom på taggene, en feilside med
 * HTTP 200 et sted foran oss). De to tilfellene må skilles: en parsefeil skal
 * IKKE tolkes som et tomt prefiks, for da sletter deletePrefix køraden uten
 * at objektene noensinne ble slettet fra R2 — stille datatap, usporbart i
 * r2_delete_queue som skal være revisjonssporet for GDPR-dokumentasjonen.
 * Derfor sjekker vi at kroppen faktisk er et S3-listesvar før vi stoler på
 * uttrekket. Et gyldig, tomt `ListBucketResult` (uten `<Contents>`) gir
 * fortsatt en tom liste, som den skal. */
export async function listObjectKeys(
  bucket: R2BucketName,
  prefix: string,
  maxObjects?: number,
): Promise<string[]> {
  if (maxObjects !== undefined && (!Number.isSafeInteger(maxObjects) || maxObjects < 1)) {
    throw new Error("maxObjects må være et positivt heltall");
  }
  const keys: string[] = [];
  let continuationToken: string | undefined;
  do {
    const url = new URL(bucketUrl(bucket));
    url.searchParams.set("list-type", "2");
    url.searchParams.set("prefix", prefix);
    if (maxObjects !== undefined) {
      url.searchParams.set("max-keys", String(Math.min(1000, maxObjects - keys.length)));
    }
    if (continuationToken) url.searchParams.set("continuation-token", continuationToken);

    const response = await getClient().fetch(url.toString(), { method: "GET" });
    if (!response.ok) {
      throw new Error(
        `Klarte ikke å liste R2-objekter (${bucket}/${prefix}): ${response.status} ${response.statusText}`,
      );
    }
    const xml = await response.text();
    if (!xml.includes("<ListBucketResult")) {
      throw new Error(
        `Uventet svar ved listing av R2-objekter (${bucket}/${prefix}): svaret var ikke et gyldig ListBucketResult`,
      );
    }
    for (const match of xml.matchAll(/<Key>([^<]*)<\/Key>/g)) {
      if (maxObjects !== undefined && keys.length >= maxObjects) break;
      keys.push(match[1]);
    }
    continuationToken =
      (maxObjects === undefined || keys.length < maxObjects) &&
      /<IsTruncated>true<\/IsTruncated>/.test(xml)
        ? /<NextContinuationToken>([^<]*)<\/NextContinuationToken>/.exec(xml)?.[1]
        : undefined;
  } while (continuationToken);
  return keys;
}

/** Sletter alt under et prefiks og returnerer antall slettede objekter.
 *
 * Prefikset må være ikke-tomt: et tomt prefiks ville tømt hele bucketen, og
 * denne funksjonen kalles med verdier som stammer fra databaserader. */
export async function deletePrefix(
  bucket: R2BucketName,
  prefix: string,
  maxObjects?: number,
): Promise<number> {
  if (!prefix) throw new Error("deletePrefix krever et ikke-tomt prefiks");

  const keys = await listObjectKeys(bucket, prefix, maxObjects);
  // ponytail: én DELETE per nøkkel; callerens maksgrense holder oppryddingen
  // avgrenset, og funksjonen brukes bare av cleanup-ruten.
  let deleted = 0;
  for (const key of keys) {
    try {
      await deleteObject(bucket, key);
      deleted += 1;
    } catch (cause) {
      throw new PrefixDeleteError(cause, deleted + 1, deleted);
    }
  }
  return deleted;
}
