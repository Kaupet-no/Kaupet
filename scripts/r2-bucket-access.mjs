// Leser Public Access for en R2-bucket fra Cloudflare-konfigurasjonen
// (r2.dev-domene og egne domener). En 404 fra et annet offentlig domene sier
// ingenting om denne bucketen, så personvernkontrollen må lese oppsettet.

const API = "https://api.cloudflare.com/client/v4";

async function getResult(url, apiToken, fetchImpl) {
  const response = await fetchImpl(url, { headers: { authorization: `Bearer ${apiToken}` } });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.success) {
    throw new Error(`Cloudflare API ${response.status} for ${url}`);
  }
  return body.result;
}

/** Returnerer domenene som gjør bucketen offentlig lesbar (tom liste = privat). */
export async function publicBucketDomains({ accountId, bucket, apiToken, fetchImpl = fetch }) {
  const base = `${API}/accounts/${accountId}/r2/buckets/${encodeURIComponent(bucket)}/domains`;
  const [managed, custom] = await Promise.all([
    getResult(`${base}/managed`, apiToken, fetchImpl),
    getResult(`${base}/custom`, apiToken, fetchImpl),
  ]);
  const domains = [];
  if (managed?.enabled) domains.push(managed.domain);
  for (const entry of custom?.domains ?? []) {
    if (entry.enabled) domains.push(entry.domain);
  }
  return domains;
}
