// Android WebView < 140 rapporterer `env(safe-area-inset-*)` som 0 under
// edge-to-edge, selv om statusfeltet faktisk overlapper WebView-en.
// Capacitors SystemBars-plugin injiserer den ekte verdien i
// `--safe-area-inset-*`-egenskapene i stedet — `env()` skal derfor aldri
// brukes alene, kun som fallback inni `var(--safe-area-inset-*, env(...))`.
// Aliasblokka i src/styles.css (rundt `--safe-top` osv.) er den ene kilden
// alle kallsteder skal bruke. De to frittstående skallsidene
// (capacitor-shell/index.html og capacitor-shell/offline.html) har hver sin
// kopi av mønsteret fordi de ikke går gjennom styles.css. Dette skriptet
// håndhever at ingen andre steder skriver `env(safe-area-inset` på nytt.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join, relative } from "node:path";

const IGNORED_DIRS = new Set([
  "node_modules",
  "dist",
  ".output",
  ".vinxi",
  ".git",
  ".claude",
  "android",
  "ios",
  "coverage",
]);

const SOURCE_EXTENSIONS = new Set([".css", ".ts", ".tsx", ".js", ".jsx", ".html"]);

const ALLOWED_FILES = new Set([
  "src/styles.css",
  "capacitor-shell/index.html",
  "capacitor-shell/offline.html",
]);

const NEEDLE = "env(safe-area-inset";
// Formen aliasene i src/styles.css skal stå i: `var(--safe-area-inset-x, env(safe-area-inset-x, ...))`.
const ALIAS_FORM =
  /var\(--safe-area-inset-(?:top|right|bottom|left),\s*env\(safe-area-inset-(?:top|right|bottom|left)/;

// Blank ut kommentarer (men behold linjeskift, slik at linjenumre stemmer),
// slik at forklarende prosa om regelen (som denne kommentarblokka selv, eller
// kommentarer i capacitor.config.ts/native-setup.ts) ikke trigger falske treff.
function stripComments(source, ext) {
  let out = source.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
  if (ext !== ".css") {
    out = out.replace(/\/\/.*$/gm, (m) => " ".repeat(m.length));
  }
  return out;
}

const violations = [];

function walk(dir) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const relPath = relative(process.cwd(), fullPath);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      if (IGNORED_DIRS.has(entry)) continue;
      walk(fullPath);
      continue;
    }
    const ext = extname(entry);
    if (!SOURCE_EXTENSIONS.has(ext)) continue;

    const source = readFileSync(fullPath, "utf8");
    const codeOnly = stripComments(source, ext);
    const originalLines = source.split(/\r?\n/);
    const codeLines = codeOnly.split(/\r?\n/);
    codeLines.forEach((line, index) => {
      if (!line.includes(NEEDLE)) return;
      const original = originalLines[index].trim();
      if (!ALLOWED_FILES.has(relPath)) {
        violations.push(`${relPath}:${index + 1}: ${original}`);
        return;
      }
      if (relPath === "src/styles.css" && !ALIAS_FORM.test(line)) {
        violations.push(
          `${relPath}:${index + 1}: rått env(safe-area-inset...) utenfor var(--safe-area-inset-*, env(...))-formen: ${original}`,
        );
      }
    });
  }
}

walk(process.cwd());

if (violations.length > 0) {
  console.error(
    "Fant env(safe-area-inset...) utenfor de tillatte stedene (se aliasblokka i src/styles.css):\n" +
      violations.join("\n"),
  );
  process.exit(1);
}

console.log("Safe-area-grensen er ren.");
