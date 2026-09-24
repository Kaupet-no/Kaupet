// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishedListingDialog } from "./published-listing-dialog";

vi.mock("@/lib/qr", () => ({
  QR_SIZE: 320,
  generateBrandedQrDataUrl: vi.fn(() => Promise.resolve("data:image/png;base64,qr")),
}));
vi.mock("@/hooks/use-listing-preview", () => ({
  useListingPreview: () => ({
    listing: {
      title: "Brun skinnsofa",
      price_nok: 5000,
      is_free: false,
      city: "Oslo",
      cover_path: null,
      kaupet_code: "48210937",
    },
    imgUrl: null,
  }),
}));

function renderDialog() {
  return render(
    <PublishedListingDialog
      listingId="listing-1"
      open
      onOpenChange={vi.fn()}
      onView={vi.fn()}
      onClose={vi.fn()}
    />,
  );
}

afterEach(() => {
  cleanup();
});

describe("PublishedListingDialog", () => {
  it("viser Lappen med formatert Kaupet-kode og uten konfetti", async () => {
    renderDialog();

    expect(screen.getByRole("heading", { name: "Lappen henger ute" })).toBeTruthy();
    expect(screen.getByText("4821 0937")).toBeTruthy();
    expect(document.querySelector("canvas")).toBeNull();
    await waitFor(() => expect(screen.getByAltText("QR-kode til annonsen")).toBeTruthy());
  });

  it("har «Del lappen» som primærhandling", () => {
    renderDialog();

    expect(screen.getByRole("button", { name: /Del lappen/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Se annonsen/ })).toBeTruthy();
  });

  it("kopierer koden ved klikk og viser kortvarig status", async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.assign(navigator, { clipboard: { writeText } });

    renderDialog();
    screen.getByRole("button", { name: "Kopier Kaupet-kode" }).click();

    await waitFor(() => expect(writeText).toHaveBeenCalledWith("48210937"));
    await waitFor(() => expect(screen.getByText("Kopiert")).toBeTruthy());
  });
});
