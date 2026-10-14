#!/usr/bin/env node
// Verifiserer at R2-oppsettet faktisk virker: tester begge buckets
// (R2_BILDER_BUCKET og R2_VEDLEGG_BUCKET) med put → get → offentlig-fetch →
// delete. Bilde-bucketen skal være offentlig (200 fra R2_PUBLIC_BASE_URL).
// Vedlegg-bucketen skal være privat: det kontrolleres ved å lese Public
// Access (r2.dev og egne domener) fra Cloudflare-API-et, ikke ved å kalle
// bildedomenet. Krever ekte credentials i miljøet (R2_ACCOUNT_ID,
// R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BILDER_BUCKET, R2_VEDLEGG_BUCKET,
// R2_PUBLIC_BASE_URL) — se .env.example — og CLOUDFLARE_API_TOKEN med
// R2-lesetilgang. Sistnevnte er et management-token og hører ikke i .env;
// sett det bare i skallet for kjøringen.
// Ikke en del av CI; kjør manuelt etter å ha satt opp/endret R2-secrets.

import { AwsClient } from "aws4fetch";

import { publicBucketDomains } from "./r2-bucket-access.mjs";

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Miljøvariabelen "${name}" mangler. Sett den i .env (se .env.example).`);
    process.exit(1);
  }
  return value;
}

const accountId = requireEnv("R2_ACCOUNT_ID");
const accessKeyId = requireEnv("R2_ACCESS_KEY_ID");
const secretAccessKey = requireEnv("R2_SECRET_ACCESS_KEY");
const bildeBucket = requireEnv("R2_BILDER_BUCKET");
const vedleggBucket = requireEnv("R2_VEDLEGG_BUCKET");
const publicBaseUrl = requireEnv("R2_PUBLIC_BASE_URL");
const apiToken = requireEnv("CLOUDFLARE_API_TOKEN");

const client = new AwsClient({ accessKeyId, secretAccessKey, service: "s3", region: "auto" });
const timestamp = Date.now();
const imageKey = `r2-probe/${timestamp}-image.txt`;
const attachmentKey = `r2-probe/${timestamp}-attachment.txt`;
const imageContent = `r2-probe-image ${new Date().toISOString()}`;
const attachmentContent = `r2-probe-attachment ${new Date().toISOString()}`;

const testObjects = [
  { bucket: bildeBucket, key: imageKey, isPublic: true },
  { bucket: vedleggBucket, key: attachmentKey, isPublic: false },
];

async function runTests() {
  const results = [];

  for (const { bucket, key, isPublic } of testObjects) {
    const content = bucket === bildeBucket ? imageContent : attachmentContent;
    const r2Url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
    const publicUrl = `${publicBaseUrl}/${key}`; // bare for bilde-bucketen

    console.log(`\nTester ${bucket}:`);

    try {
      // PUT
      const putResponse = await client.fetch(r2Url, {
        method: "PUT",
        body: content,
        headers: { "content-type": "text/plain" },
      });
      if (!putResponse.ok) {
        throw new Error(`PUT feilet: ${putResponse.status}`);
      }
      console.log("✓ PUT OK");
      results.push({ bucket, key, success: true });

      // GET med credentials
      const getResponse = await client.fetch(r2Url, { method: "GET" });
      if (!getResponse.ok) {
        throw new Error(`GET feilet: ${getResponse.status}`);
      }
      const retrievedContent = await getResponse.text();
      if (retrievedContent !== content) {
        throw new Error(`Innholdet stemte ikke: sendte "${content}", fikk "${retrievedContent}"`);
      }
      console.log("✓ GET med credentials OK");

      if (isPublic) {
        const publicResponse = await fetch(publicUrl);
        if (!publicResponse.ok) {
          throw new Error(`Offentlig URL feilet: ${publicResponse.status} (forventet 200)`);
        }
        const publicContent = await publicResponse.text();
        if (publicContent !== content) {
          throw new Error(
            `Offentlig innhold stemte ikke: sendte "${content}", fikk "${publicContent}"`,
          );
        }
        console.log("✓ Offentlig URL OK (200)");
      } else {
        const domains = await publicBucketDomains({ accountId, bucket, apiToken });
        if (domains.length > 0) {
          throw new Error(`Bucketen er offentlig via ${domains.join(", ")} (forventet privat)`);
        }
        console.log("✓ Ingen offentlige domener på bucketen");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`✗ ${message}`);
      // Merk som mislykket, men fortsett med cleanup
      const entry = results.find((r) => r.bucket === bucket && r.key === key);
      if (entry) {
        entry.success = false;
      } else {
        results.push({ bucket, key, success: false });
      }
    }

    // DELETE — gjøres uansett
    try {
      const r2Url = `https://${accountId}.r2.cloudflarestorage.com/${bucket}/${key}`;
      const deleteResponse = await client.fetch(r2Url, { method: "DELETE" });
      if (!deleteResponse.ok) {
        throw new Error(`DELETE feilet: ${deleteResponse.status}`);
      }
      console.log("✓ Slettet testobjekt");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`✗ Opprulle feilet: ${message}`);
      // Merk som mislykket
      const entry = results.find((r) => r.bucket === bucket && r.key === key);
      if (entry) {
        entry.success = false;
      }
    }
  }

  // Sammendrag
  const allSucceeded = results.every((r) => r.success);
  if (allSucceeded) {
    console.log(`\nR2-oppsettet virker: ${results.length} buckets fullført OK.`);
    process.exit(0);
  } else {
    console.error(
      `\nR2-probe feilet: ${results.filter((r) => !r.success).length} av ${results.length} buckets hadde problemer.`,
    );
    process.exit(1);
  }
}

runTests();
