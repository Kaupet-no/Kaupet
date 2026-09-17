// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// public/boot.js kjører synkront i <head> og er den eneste som rekker å dekke
// SSR-malingen med boot-splashen. Den er ren JS uten import/eksport, så den
// testes ved å kjøre den mot et jsdom-vindu.
const source = readFileSync(resolve(process.cwd(), "public/boot.js"), "utf8");

function bootAt(url: string): string {
  window.history.replaceState(null, "", url);
  document.documentElement.className = "";
  new Function(source).call(window);
  return document.documentElement.className;
}

describe("boot.js", () => {
  it("markerer ikke vanlige web-besøk", () => {
    expect(bootAt("/")).not.toContain("native-boot");
  });

  it("markerer ?forcenative slik at splashen dekker SSR-malingen", () => {
    expect(bootAt("/?forcenative")).toContain("native-boot");
  });

  it("husker overstyringen på tvers av ruter i samme fane", () => {
    window.sessionStorage.setItem("kaupet.forceNative", "true");
    expect(bootAt("/annonser")).toContain("native-boot");
    window.sessionStorage.clear();
  });

  it("respekterer ?forcenative=0", () => {
    window.sessionStorage.setItem("kaupet.forceNative", "true");
    expect(bootAt("/?forcenative=0")).not.toContain("native-boot");
    window.sessionStorage.clear();
  });
});
