import { readdirSync, statSync } from "node:fs";
import path from "node:path";

const CLIENT_DIR = path.resolve("dist/client");
const JS_LIMIT = 450 * 1024;
const CSS_LIMIT = 180 * 1024;

function walk(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const filePath = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(filePath) : [filePath];
  });
}

function assertBudget(label, files, limit) {
  const measured = files
    .map((file) => ({ file, bytes: statSync(file).size }))
    .sort((a, b) => b.bytes - a.bytes);
  const largest = measured[0];
  if (!largest) return;

  const relative = path.relative(CLIENT_DIR, largest.file);
  console.log(
    `${label}: ${relative} (${(largest.bytes / 1024).toFixed(1)} KiB / ${limit / 1024} KiB)`,
  );
  if (largest.bytes > limit) {
    throw new Error(`${label}-budsjettet er overskredet av ${relative}`);
  }

  if (label === "Største JavaScript-fil") {
    console.log("Fem største JavaScript-filer:");
    for (const { file, bytes } of measured.slice(0, 5)) {
      console.log(`  ${path.relative(CLIENT_DIR, file)} (${(bytes / 1024).toFixed(1)} KiB)`);
    }
  }
}

const files = walk(CLIENT_DIR);
assertBudget(
  "Største JavaScript-fil",
  files.filter((file) => /\.(?:js|mjs)$/.test(file)),
  JS_LIMIT,
);
assertBudget(
  "Største CSS-fil",
  files.filter((file) => file.endsWith(".css")),
  CSS_LIMIT,
);
