// Lokal, ikke-CI evaluering av fotoforslagets identify-kall mot ekte Mistral.
// Kjører `suggestListingFromPhotosAi` (produksjonskoden, ekte kategoritre fra
// SUPABASE_URL i .env) på et fast sett tydelige bilder og skriver treffprosent,
// prompt-tokens og svartid. Bildene er macOS' innebygde brukerbilder, så
// skriptet er macOS-only (sips + ffmpeg) og sjekker ikke inn noen bildefiler.
//
//   bun scripts/eval-photo-identify.ts [--size 480] [--runs 1]
//
// Bun laster .env automatisk. Nøkler skrives aldri ut.
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { containsImageMetadata } from "@/lib/image-metadata";
import { suggestListingFromPhotosAi } from "@/lib/category-suggestion-ai.server";

const PICTURES = "/Library/User Pictures";
const CASES: Array<{ file: string; expected: string[] }> = [
  { file: "Instruments/Guitar.heic", expected: ["musikkinstrumenter"] },
  { file: "Instruments/Drum.heic", expected: ["musikkinstrumenter"] },
  { file: "Instruments/Piano.heic", expected: ["musikkinstrumenter"] },
  { file: "Instruments/Violin.heic", expected: ["musikkinstrumenter"] },
  { file: "Instruments/Turntable.heic", expected: ["hifi-og-forsterkere", "lyd-og-studioutstyr"] },
  { file: "Sports/Basketball.heic", expected: ["basketball"] },
  { file: "Sports/Soccer.heic", expected: ["fotball"] },
  { file: "Sports/Golf.heic", expected: ["golf"] },
  { file: "Sports/Tennis.heic", expected: ["tennis-og-padel"] },
  { file: "Flowers/Sunflower.heic", expected: ["planter-og-jord"] },
  { file: "Nature/Cactus.heic", expected: ["planter-og-jord"] },
];

const { values } = parseArgs({
  options: { size: { type: "string", default: "480" }, runs: { type: "string", default: "1" } },
});
const size = Number(values.size);
const runs = Number(values.runs);
process.env.MISTRAL_PHOTO_SUGGESTIONS_ENABLED = "true";

// Fang usage og svartid fra Mistral-kallet uten å endre produksjonskoden.
let lastUsage: { prompt_tokens?: number; completion_tokens?: number } | undefined;
const realFetch = globalThis.fetch;
globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
  const response = await realFetch(...args);
  if (String(args[0]).includes("mistral.ai")) {
    lastUsage = ((await response.clone().json()) as { usage?: typeof lastUsage }).usage;
  }
  return response;
}) as typeof fetch;

const dir = mkdtempSync(join(tmpdir(), "photo-eval-"));
let top1 = 0;
let anyHit = 0;
let total = 0;
const tokens: number[] = [];
const latencies: number[] = [];

for (const { file, expected } of CASES) {
  // sips skalerer HEIC, men skriver alltid EXIF; ffmpeg re-enkoder til ren
  // 4:2:0-JPEG, som nettleserens canvas.
  const base = join(dir, file.replace(/\W+/g, "_"));
  execFileSync(
    "sips",
    ["-s", "format", "png", "-Z", String(size), join(PICTURES, file), "--out", `${base}.png`],
    { stdio: "ignore" },
  );
  execFileSync(
    "ffmpeg",
    [
      "-y",
      "-i",
      `${base}.png`,
      "-map_metadata",
      "-1",
      "-pix_fmt",
      "yuvj420p",
      "-q:v",
      "5",
      `${base}.jpg`,
    ],
    { stdio: "ignore" },
  );
  const out = `${base}.jpg`;
  const bytes = readFileSync(out);
  if (containsImageMetadata(bytes)) throw new Error(`${file}: sips-utdata har metadata`);
  const dataUrl = `data:image/jpeg;base64,${bytes.toString("base64")}`;

  for (let run = 0; run < runs; run += 1) {
    lastUsage = undefined;
    const started = performance.now();
    const result = await suggestListingFromPhotosAi({
      operation: "identify",
      images: [{ mime: "image/jpeg", dataUrl }],
    });
    const ms = Math.round(performance.now() - started);
    const slugs = result.categories.map((category) => category.slug);
    const title = "title" in result ? result.title : "";
    total += 1;
    if (expected.includes(slugs[0])) top1 += 1;
    if (slugs.some((slug) => expected.includes(slug))) anyHit += 1;
    if (lastUsage?.prompt_tokens) tokens.push(lastUsage.prompt_tokens);
    latencies.push(ms);
    const mark = expected.includes(slugs[0])
      ? "✓"
      : slugs.some((s) => expected.includes(s))
        ? "~"
        : "✗";
    console.log(
      `${mark} ${file.padEnd(28)} ${(slugs.join(",") || result.status).padEnd(40)} «${title ?? ""}» ${ms} ms, ${lastUsage?.prompt_tokens ?? "?"}+${lastUsage?.completion_tokens ?? "?"} tok, ${bytes.length >> 10} KiB`,
    );
  }
}

const pct = (n: number) => `${Math.round((100 * n) / total)} %`;
const avg = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length));
console.log(
  `\n${size}px: topp-1 ${top1}/${total} (${pct(top1)}), blant forslag ${anyHit}/${total} (${pct(anyHit)}), ` +
    `snitt ${avg(tokens)} prompt-tokens, snitt ${avg(latencies)} ms, maks ${Math.max(...latencies)} ms`,
);
