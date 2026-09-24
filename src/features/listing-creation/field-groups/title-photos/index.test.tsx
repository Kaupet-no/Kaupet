// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { PhotosGroup } from ".";

afterEach(cleanup);

describe("PhotosGroup", () => {
  it("viser ikke bekreftelsesmeldingen før Neste er trykket uten bilder", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
      />,
    );
    expect(screen.queryByText(/Annonser med bilder får flere henvendelser/)).toBeNull();
  });

  it("viser en inline melding (role=status) etter første Neste uten bilder", () => {
    render(
      <PhotosGroup images={[]} setImages={vi.fn()} uploadProgress={null} noImageConfirmPending />,
    );
    const message = screen.getByText(/Annonser med bilder får flere henvendelser/);
    expect(message.getAttribute("role")).toBe("status");
  });

  it("skjuler meldingen igjen når et bilde er lagt til", () => {
    const image = {
      id: "1",
      file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
      thumbFile: new File(["x"], "a.jpg", { type: "image/jpeg" }),
      previewUrl: "blob:fake",
    } satisfies WizardSharedProps["images"][number];

    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending
      />,
    );
    expect(screen.queryByText(/Annonser med bilder får flere henvendelser/)).toBeNull();
  });
});
