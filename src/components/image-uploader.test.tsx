// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const native = vi.hoisted(() => ({ isNative: vi.fn(() => false), takeNativePhoto: vi.fn() }));
vi.mock("@/lib/native", () => native);

import { ImageUploader, type PendingImage } from "./image-uploader";

beforeEach(() => {
  vi.stubGlobal(
    "URL",
    class extends URL {
      static revokeObjectURL = vi.fn();
    },
  );
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function image(id: string, aiGenerated?: boolean): PendingImage {
  const file = new File(["foto"], `${id}.jpg`, { type: "image/jpeg" });
  return { id, file, thumbFile: file, previewUrl: `blob:${id}`, aiGenerated };
}

describe("ImageUploader", () => {
  it("åpner filvelgeren for galleriet i appen, så KI-metadataen bevares", () => {
    native.isNative.mockReturnValue(true);
    const click = vi.spyOn(HTMLInputElement.prototype, "click").mockImplementation(() => {});
    render(<ImageUploader images={[]} onChange={vi.fn()} />);

    screen.getByRole("button", { name: "Velg fra bilder" }).click();

    expect(click).toHaveBeenCalledOnce();
    expect((click.mock.contexts[0] as HTMLInputElement).getAttribute("aria-label")).toBe(
      "Velg bilder",
    );
    expect(native.takeNativePhoto).not.toHaveBeenCalled();
    click.mockRestore();
    native.isNative.mockReturnValue(false);
  });

  it("viser «Ta bilde» og «Velg fra bilder» som to handlinger på web, med kamera-capture på input", () => {
    render(<ImageUploader images={[]} onChange={vi.fn()} />);

    expect(screen.getByRole("button", { name: /Ta bilde/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Velg fra bilder" })).toBeTruthy();

    const captureInput = screen.getByTestId("image-capture-input") as HTMLInputElement;
    expect(captureInput.getAttribute("capture")).toBe("environment");
    expect(captureInput.getAttribute("accept")).toBe("image/*");
  });

  it("viser bildetips før første bilde er lagt til", () => {
    render(<ImageUploader images={[]} onChange={vi.fn()} />);
    expect(screen.getByText(/Ta minst ett bilde av hele tingen i dagslys/)).toBeTruthy();
  });

  it("viser ett samlet varsel og merker bare berørte bilder, også etter omrokkering (CRE-18)", () => {
    const images = [image("a", true), image("b", false), image("c", true), image("d", true)];
    const { rerender } = render(<ImageUploader images={images} onChange={vi.fn()} />);
    expect(
      screen.getByRole("region", { name: "Informasjon om bildemerking" }).textContent,
    ).toContain("3 av 4 bilder blir merket");
    expect(screen.getAllByRole("button", { name: "Merket som KI" })).toHaveLength(3);
    expect(
      within(screen.getAllByRole("listitem")[1]).queryByRole("button", { name: "Merket som KI" }),
    ).toBeNull();

    rerender(
      <ImageUploader images={[images[1], images[0], images[3], images[2]]} onChange={vi.fn()} />,
    );
    expect(
      within(screen.getAllByRole("listitem")[0]).queryByRole("button", { name: "Merket som KI" }),
    ).toBeNull();
    expect(
      within(screen.getAllByRole("listitem")[1]).getByRole("button", { name: "Merket som KI" }),
    ).toBeTruthy();
  });

  it("oppdaterer antall og entall når bilder fjernes, og skjuler varselet uten treff (tilstandsovergang)", () => {
    const marked = image("a", true);
    const unmarked = image("b");
    const { rerender } = render(<ImageUploader images={[marked, unmarked]} onChange={vi.fn()} />);
    expect(screen.getByText("1 av 2 bilder blir merket")).toBeTruthy();
    expect(screen.getByText(/Bildefilen oppgir at KI er brukt. Dette bildet/)).toBeTruthy();

    rerender(<ImageUploader images={[marked]} onChange={vi.fn()} />);
    expect(screen.getByText("1 av 1 bilde blir merket")).toBeTruthy();

    rerender(<ImageUploader images={[unmarked]} onChange={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Informasjon om bildemerking" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Merket som KI" })).toBeNull();

    rerender(<ImageUploader images={[]} onChange={vi.fn()} />);
    expect(screen.queryByRole("region", { name: "Informasjon om bildemerking" })).toBeNull();
  });
});
