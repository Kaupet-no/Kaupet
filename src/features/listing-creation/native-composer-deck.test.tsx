// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NativeComposerDeck } from "./native-composer-deck";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function swipe(target: Element, fromX: number, toX: number, toY = 0) {
  fireEvent.pointerDown(target, { pointerId: 1, isPrimary: true, clientX: fromX, clientY: 0 });
  fireEvent.pointerMove(target, { pointerId: 1, isPrimary: true, clientX: toX, clientY: toY });
  fireEvent.pointerUp(target, { pointerId: 1, isPrimary: true, clientX: toX, clientY: toY });
}

describe("NativeComposerDeck", () => {
  it("bruker samme fremoverhandling for swipe og lar bakoverswipe gå tilbake", async () => {
    const onForward = vi.fn().mockResolvedValue(true);
    const onBack = vi.fn();
    render(
      <NativeComposerDeck onForward={onForward} onBack={onBack}>
        <p>Aktivt kort</p>
      </NativeComposerDeck>,
    );
    const card = screen.getByTestId("native-composer-card");

    swipe(card, 120, 20);
    await waitFor(() => expect(onForward).toHaveBeenCalledOnce());
    swipe(card, 20, 120);
    expect(onBack).toHaveBeenCalledOnce();
  });

  it("kaprer ikke vertikal scroll eller gester fra interaktive kontroller", () => {
    const onForward = vi.fn().mockResolvedValue(true);
    render(
      <NativeComposerDeck onForward={onForward}>
        <textarea aria-label="Beskrivelse" />
        <div data-composer-no-swipe>Bildeflate</div>
      </NativeComposerDeck>,
    );

    swipe(screen.getByTestId("native-composer-card"), 100, 20, 100);
    swipe(screen.getByRole("textbox", { name: "Beskrivelse" }), 100, 0);
    swipe(screen.getByText("Bildeflate"), 100, 0);
    expect(onForward).not.toHaveBeenCalled();
  });

  it("fjerner translasjon ved redusert bevegelse", () => {
    vi.stubGlobal(
      "matchMedia",
      vi.fn(() => ({ matches: true })),
    );
    render(
      <NativeComposerDeck onForward={vi.fn().mockResolvedValue(true)}>Kort</NativeComposerDeck>,
    );
    const card = screen.getByTestId("native-composer-card");

    fireEvent.pointerDown(card, { pointerId: 1, isPrimary: true, clientX: 100, clientY: 0 });
    fireEvent.pointerMove(card, { pointerId: 1, isPrimary: true, clientX: 20, clientY: 0 });
    expect((card as HTMLElement).style.transform).toBe("");
  });

  it("blokkerer et nytt swipe mens fremovernavigasjon pågår", async () => {
    let resolve!: (value: boolean) => void;
    const onForward = vi.fn(() => new Promise<boolean>((done) => (resolve = done)));
    render(<NativeComposerDeck onForward={onForward}>Kort</NativeComposerDeck>);
    const card = screen.getByTestId("native-composer-card");

    swipe(card, 100, 0);
    await waitFor(() => expect(card.getAttribute("aria-busy")).toBe("true"));
    swipe(card, 100, 0);
    expect(onForward).toHaveBeenCalledOnce();
    resolve(true);
  });
});
