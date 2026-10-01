// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ShareListingDialog } from "./share-listing-dialog";

const generate = vi.fn<(url: string) => Promise<string>>();
vi.mock("@/lib/qr", () => ({
  QR_SIZE: 256,
  generateBrandedQrDataUrl: (url: string) => generate(url),
}));
vi.mock("@/lib/native", () => ({ isNative: () => false, shareContent: vi.fn() }));

window.matchMedia = ((query: string) => ({
  matches: true,
  media: query,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia;

afterEach(() => {
  cleanup();
  generate.mockReset();
});

const props = { onOpenChange: () => {}, kaupetCode: "ABC123", title: "Sykkel" };

describe("ShareListingDialog: QR", () => {
  it("viser QR etter generering, og genererer på nytt med spinner ved gjenåpning", async () => {
    generate.mockResolvedValueOnce("data:first");
    const { rerender } = render(<ShareListingDialog open {...props} />);
    expect(generate).toHaveBeenCalledWith("https://kaupet.no/ABC123");
    expect((await screen.findByAltText("QR-kode til annonsen")).getAttribute("src")).toBe(
      "data:first",
    );

    rerender(<ShareListingDialog open={false} {...props} />);
    let resolve!: (v: string) => void;
    generate.mockReturnValueOnce(new Promise((r) => (resolve = r)));
    rerender(<ShareListingDialog open {...props} />);
    expect(screen.queryByAltText("QR-kode til annonsen")).toBeNull();
    resolve("data:second");
    expect((await screen.findByAltText("QR-kode til annonsen")).getAttribute("src")).toBe(
      "data:second",
    );
    expect(generate).toHaveBeenCalledTimes(2);
  });

  it("viser feilmelding når generering feiler", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    generate.mockRejectedValueOnce(new Error("boom"));
    render(<ShareListingDialog open {...props} />);
    expect(await screen.findByText("Kunne ikke generere QR-kode")).toBeTruthy();
  });
});
