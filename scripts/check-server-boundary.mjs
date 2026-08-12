import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["src/routes", "src/components", "src/features"];
const violations = [];

function visit(path) {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    if (statSync(fullPath).isDirectory()) {
      visit(fullPath);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    const source = readFileSync(fullPath, "utf8");
    const lines = source.split(/\r?\n/);
    lines.forEach((line, index) => {
      // Dynamic imports inside route server handlers are intentional; static
      // imports are the ones that can pull server modules into client graphs.
      if (/\bfrom\s+["'][^"']+\.server(?:\.[^"']+)?["']/.test(line)) {
        violations.push(`${relative(process.cwd(), fullPath)}:${index + 1}: ${line.trim()}`);
      }
    });
  }
}

ROOTS.forEach(visit);

if (violations.length > 0) {
  console.error("Server modules imported by client-reachable code:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Server/client import boundary is clean.");
