// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/native", () => ({
  isNative: () => false,
  pickNativePhoto: vi.fn(),
}));

import { ImageUploader } from "./image-uploader";

afterEach(cleanup);

describe("ImageUploader", () => {
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
});
