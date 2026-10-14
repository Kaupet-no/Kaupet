import assert from "node:assert/strict";
import { test } from "node:test";
import { publicBucketDomains } from "./r2-bucket-access.mjs";

function fakeFetch(config) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const key = url.endsWith("/managed") ? "managed" : "custom";
    return new Response(JSON.stringify({ success: true, result: config[key] }));
  };
  return { calls, fetchImpl };
}

const args = { accountId: "acc", bucket: "kaupet-vedlegg", apiToken: "t" };

test("offentlig vedleggsbucket avvises selv om bildedomenet er et annet", async () => {
  const { calls, fetchImpl } = fakeFetch({
    managed: { enabled: true, domain: "pub-x.r2.dev" },
    custom: { domains: [{ domain: "vedlegg.example.invalid", enabled: true }] },
  });
  const domains = await publicBucketDomains({ ...args, fetchImpl });
  assert.deepEqual(domains, ["pub-x.r2.dev", "vedlegg.example.invalid"]);
  assert.ok(calls.every((url) => url.includes("/r2/buckets/kaupet-vedlegg/")));
});

test("privat bucket gir tom liste", async () => {
  const { fetchImpl } = fakeFetch({
    managed: { enabled: false, domain: "pub-x.r2.dev" },
    custom: { domains: [{ domain: "gammel.example.invalid", enabled: false }] },
  });
  assert.deepEqual(await publicBucketDomains({ ...args, fetchImpl }), []);
});

test("API-feil gir ikke falsk trygghet", async () => {
  const fetchImpl = async () => new Response("{}", { status: 403 });
  await assert.rejects(publicBucketDomains({ ...args, fetchImpl }), /Cloudflare API 403/);
});
