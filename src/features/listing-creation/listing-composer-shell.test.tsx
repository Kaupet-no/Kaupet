// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ListingComposerShell } from "./listing-composer-shell";

vi.mock("@/components/native-page-header", () => ({
  NativePageHeader: () => <header>Ny annonse</header>,
}));

const { hapticNotification, hapticSelection } = vi.hoisted(() => ({
  hapticNotification: vi.fn(),
  hapticSelection: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ hapticNotification, hapticSelection }));

function renderShell({ firstStep = false, footer = "Fortsett", native = true } = {}) {
  const onBack = vi.fn();
  const onCancel = vi.fn();
  const result = render(
    <ListingComposerShell
      title="Ny annonse"
      pageKey="title"
      pageTitle="Tittel"
      native={native}
      onBack={onBack}
      onCancel={onCancel}
      footer={<button type="button">{footer}</button>}
      firstStep={firstStep}
    >
      Innhold
    </ListingComposerShell>,
  );
  return { onBack, onCancel, ...result };
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ListingComposerShell", () => {
  it("skjuler Forrige på første native steg", () => {
    const { container } = renderShell({ firstStep: true });
    expect(container.querySelector('button[aria-hidden="true"]')?.getAttribute("tabindex")).toBe(
      "-1",
    );
  });

  it("viser treposisjonsnavigasjon på et mellomsteg", () => {
    const { onBack, onCancel } = renderShell();
    fireEvent.click(screen.getByRole("button", { name: "Forrige" }));
    fireEvent.click(screen.getByRole("button", { name: "Avbryt annonseopprettelse" }));
    expect(onBack).toHaveBeenCalledOnce();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Fortsett" })).toBeTruthy();
  });

  it("gir ett lett valgsignal når native-kortet skifter", () => {
    const { rerender } = renderShell();
    rerender(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="description"
        pageTitle="Beskrivelse"
        native
        onBack={vi.fn()}
        onCancel={vi.fn()}
        footer={<button type="button">Fortsett</button>}
        firstStep={false}
      >
        Innhold
      </ListingComposerShell>,
    );
    expect(hapticSelection).toHaveBeenCalledOnce();
  });

  it("viser publisering i høyre posisjon på siste steg", () => {
    renderShell({ footer: "Publiser" });
    expect(screen.getByRole("button", { name: "Publiser" })).toBeTruthy();
  });

  it("lar webfooteren være uten native kontrollrad", () => {
    renderShell({ native: false });
    expect(screen.queryByRole("button", { name: "Avbryt annonseopprettelse" })).toBeNull();
    expect(screen.getByRole("button", { name: "Fortsett" })).toBeTruthy();
  });

  it("viser og nullstiller native valideringsrespons ved animationend", async () => {
    const { rerender } = renderShell();
    rerender(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="title"
        pageTitle="Tittel"
        native
        onBack={vi.fn()}
        onCancel={vi.fn()}
        errorSummary="Fyll inn tittelen før du fortsetter."
        validationAttempt={1}
        footer={<button type="button">Fortsett</button>}
        firstStep={false}
      >
        Innhold
      </ListingComposerShell>,
    );

    const page = screen.getByTestId("composer-page-title");
    await waitFor(() => expect(page.getAttribute("aria-invalid")).toBe("true"));
    expect(hapticNotification).toHaveBeenCalledWith("error");
    page.dispatchEvent(new Event("webkitAnimationEnd", { bubbles: true }));
    await waitFor(() => expect(page.getAttribute("aria-invalid")).toBeNull());
  });
});
