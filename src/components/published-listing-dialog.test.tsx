// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { PublishedListingDialog } from "./published-listing-dialog";

const confettiCreate = vi.hoisted(() => vi.fn(() => vi.fn()));
const reducedMotion = vi.hoisted(() => ({ current: false }));

vi.mock("canvas-confetti", () => ({ default: { create: confettiCreate } }));
vi.mock("@/hooks/use-reduced-motion", () => ({
  useReducedMotion: () => reducedMotion.current,
}));
vi.mock("@/hooks/use-listing-preview", () => ({
  useListingPreview: () => ({
    listing: {
      title: "Brun skinnsofa",
      price_nok: 5000,
      is_free: false,
      city: "Oslo",
      cover_path: null,
      kaupet_code: "ABC123",
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
  confettiCreate.mockClear();
  reducedMotion.current = false;
});

describe("PublishedListingDialog", () => {
  it("feirer publiseringen med konfetti", async () => {
    renderDialog();

    expect(screen.getByText(/Annonsen din er publisert/)).toBeTruthy();
    await waitFor(() => expect(confettiCreate).toHaveBeenCalledOnce());
  });

  it("hopper over animasjonen når brukeren har bedt om redusert bevegelse", async () => {
    reducedMotion.current = true;
    renderDialog();

    // Dialogen skal fortsatt vise bekreftelsen — det er kun animasjonen som utgår.
    expect(screen.getByText(/Annonsen din er publisert/)).toBeTruthy();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(confettiCreate).not.toHaveBeenCalled();
  });
});
