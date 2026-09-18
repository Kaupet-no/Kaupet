// @vitest-environment jsdom
/** @vitest-environment-options { "url": "https://kaupet.no/" } */
//
// Egen fil fordi jsdom-URL-en settes per fil via docblock over — den kan
// ikke overstyres per test slik som i boot-script.test.ts, som kjører på
// localhost.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const source = readFileSync(resolve(process.cwd(), "public/boot.js"), "utf8");

function bootAt(url: string): string {
  window.history.replaceState(null, "", url);
  document.documentElement.className = "";
  new Function(source).call(window);
  return document.documentElement.className;
}

describe("boot.js på produksjonsvert", () => {
  it("ignorerer ?forcenative utenfor dev-verter", () => {
    expect(bootAt("https://kaupet.no/?forcenative")).not.toContain("native-boot");
  });
});
