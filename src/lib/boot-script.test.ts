// @vitest-environment jsdom
import { act, createElement } from "react";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// public/boot.js kjører synkront i <head> og er den eneste som rekker å dekke
// SSR-malingen med boot-splashen. Den er ren JS uten import/eksport, så den
// testes ved å kjøre den mot et jsdom-vindu.
const source = readFileSync(resolve(process.cwd(), "public/boot.js"), "utf8");
const rootSource = readFileSync(resolve(process.cwd(), "src/routes/__root.tsx"), "utf8");

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
    window.sessionStorage.setItem("kaupet_force_native", "true");
    expect(bootAt("/annonser")).toContain("native-boot");
    window.sessionStorage.clear();
  });

  it("respekterer ?forcenative=0", () => {
    window.sessionStorage.setItem("kaupet_force_native", "true");
    expect(bootAt("/?forcenative=0")).not.toContain("native-boot");
    window.sessionStorage.clear();
  });

  it("tillater boot-mutasjon på roten, men rapporterer andre hydreringsfeil", async () => {
    expect(rootSource).toContain('<html lang="nb" suppressHydrationWarning>');

    const serverMarkup = renderToString(
      createElement("div", { suppressHydrationWarning: true }, createElement("span", null, "SSR")),
    );
    const container = document.createElement("div");
    container.innerHTML = serverMarkup;
    document.body.append(container);
    container.firstElementChild?.classList.add("native-boot");
    const hydrationErrors: unknown[] = [];
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await act(async () => {
      hydrateRoot(
        container,
        createElement(
          "div",
          { suppressHydrationWarning: true },
          createElement("span", null, "client"),
        ),
        { onRecoverableError: (error) => hydrationErrors.push(error) },
      );
    });

    expect(consoleError).not.toHaveBeenCalled();
    expect(hydrationErrors).toHaveLength(1);
    expect(String(hydrationErrors[0])).toContain("Hydration failed");
    consoleError.mockRestore();
  });
});
