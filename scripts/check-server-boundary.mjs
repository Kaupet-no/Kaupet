import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import ts from "typescript";

const ROOTS = ["src/routes", "src/components", "src/features"];
const violations = [];
const importsByFile = new Map();

function resolveLocalImport(from, specifier) {
  const base = specifier.startsWith("@/")
    ? resolve("src", specifier.slice(2))
    : resolve(dirname(from), specifier);
  return [base, `${base}.ts`, `${base}.tsx`, join(base, "index.ts"), join(base, "index.tsx")].find(
    existsSync,
  );
}

function visit(path) {
  for (const entry of readdirSync(path)) {
    const fullPath = join(path, entry);
    if (statSync(fullPath).isDirectory()) {
      visit(fullPath);
      continue;
    }
    if (!/\.tsx?$/.test(entry)) continue;
    const source = readFileSync(fullPath, "utf8");
    const sourceFile = ts.createSourceFile(fullPath, source, ts.ScriptTarget.Latest, true);
    importsByFile.set(
      resolve(fullPath),
      sourceFile.statements.flatMap((statement) => {
        if (!ts.isImportDeclaration(statement) && !ts.isExportDeclaration(statement)) return [];
        if (!statement.moduleSpecifier || !ts.isStringLiteral(statement.moduleSpecifier)) return [];
        if (ts.isImportDeclaration(statement) && statement.importClause?.isTypeOnly) return [];
        if (ts.isExportDeclaration(statement) && statement.isTypeOnly) return [];
        return [statement.moduleSpecifier.text];
      }),
    );
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

function findLeafletImport(file, chain = [], seen = new Set()) {
  if (seen.has(file)) return null;
  seen.add(file);
  for (const specifier of importsByFile.get(file) ?? []) {
    if (
      specifier === "leaflet" ||
      specifier.startsWith("leaflet/") ||
      specifier === "react-leaflet"
    ) {
      return [...chain, file, specifier];
    }
    if (!specifier.startsWith("@/") && !specifier.startsWith(".")) continue;
    const importedFile = resolveLocalImport(file, specifier);
    if (!importedFile) continue;
    const found = findLeafletImport(resolve(importedFile), [...chain, file], new Set(seen));
    if (found) return found;
  }
  return null;
}

for (const routeFile of importsByFile.keys()) {
  if (!routeFile.startsWith(resolve("src/routes"))) continue;
  const chain = findLeafletImport(routeFile);
  if (!chain) continue;
  violations.push(
    `Leaflet in SSR import graph: ${chain
      .map((entry) => (entry.startsWith("/") ? relative(process.cwd(), entry) : entry))
      .join(" -> ")}`,
  );
}

if (violations.length > 0) {
  console.error("Server modules imported by client-reachable code:\n" + violations.join("\n"));
  process.exit(1);
}

console.log("Server/client import boundary is clean.");
