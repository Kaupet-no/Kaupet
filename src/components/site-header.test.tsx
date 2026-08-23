// @vitest-environment jsdom
import { act } from "react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it } from "vitest";
import { waitFor } from "@testing-library/react";
import { HeaderSearchPortal } from "./site-header";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => document.body.replaceChildren());

describe("HeaderSearchPortal", () => {
  it("hydrerer uten avvik og beholder søkefeltet gjennom sticky-overgangen", async () => {
    const serverHtml = renderToString(
      <HeaderSearchPortal>
        <input aria-label="Søk i annonser" />
      </HeaderSearchPortal>,
    );
    const app = document.createElement("div");
    const slot = document.createElement("div");
    slot.id = "header-search-slot";
    app.innerHTML = serverHtml;
    document.body.append(app, slot);
    const hydrationErrors: unknown[] = [];
    let root!: Root;

    await act(async () => {
      root = hydrateRoot(
        app,
        <HeaderSearchPortal>
          <input aria-label="Søk i annonser" />
        </HeaderSearchPortal>,
        { onRecoverableError: (error) => hydrationErrors.push(error) },
      );
    });

    const input = await waitFor(() => {
      const element = slot.querySelector<HTMLInputElement>('input[aria-label="Søk i annonser"]');
      expect(element).not.toBeNull();
      return element!;
    });
    input.value = "sykkel";
    input.focus();

    await act(async () => {
      root.render(
        <HeaderSearchPortal>
          <input aria-label="Søk i annonser" aria-hidden />
        </HeaderSearchPortal>,
      );
    });

    expect(hydrationErrors).toEqual([]);
    expect(slot.querySelector("input")).toBe(input);
    expect(input.value).toBe("sykkel");
    expect(document.activeElement).toBe(input);

    await act(async () => root.unmount());
  });
});
