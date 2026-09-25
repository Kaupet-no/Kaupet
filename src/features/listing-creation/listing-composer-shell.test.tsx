// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListingComposerShell } from "./listing-composer-shell";

vi.mock("@/components/native-page-header", () => ({
  NativePageHeader: ({ right }: { right?: ReactNode }) => (
    <header>
      Ny annonse
      {right}
    </header>
  ),
}));

const { hapticNotification, hapticSelection } = vi.hoisted(() => ({
  hapticNotification: vi.fn(),
  hapticSelection: vi.fn(),
}));
vi.mock("@/lib/haptics", () => ({ hapticNotification, hapticSelection }));

function renderShell({
  firstStep = false,
  footer = "Fortsett",
  native = true,
  preview = null,
  previewSection,
  strength = null,
}: {
  firstStep?: boolean;
  footer?: string;
  native?: boolean;
  preview?: ReactNode;
  previewSection?: string;
  strength?: ReactNode;
} = {}) {
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
      preview={preview}
      previewSection={previewSection}
      strength={strength}
    >
      Innhold
    </ListingComposerShell>,
  );
  return { onBack, onCancel, ...result };
}

beforeEach(() => {
  window.scrollTo = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("ListingComposerShell", () => {
  it("flytter fokus til sidetittelen når første steg åpnes", () => {
    const requestAnimationFrame = vi
      .spyOn(window, "requestAnimationFrame")
      .mockImplementation((callback) => {
        callback(0);
        return 1;
      });

    renderShell();

    expect(document.activeElement).toBe(
      screen.getByRole("heading", { name: "Tittel", hidden: true }),
    );
    requestAnimationFrame.mockRestore();
  });

  it("skjuler Forrige på første native steg", () => {
    const { container } = renderShell({ firstStep: true });
    expect(container.querySelector('button[aria-hidden="true"]')?.getAttribute("tabindex")).toBe(
      "-1",
    );
  });

  it("viser Forrige/Fortsett i footeren og Avbryt i headeren på et mellomsteg", () => {
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

  it("viser Tilbake-chevron i webtoppstripa på et mellomsteg, ikke på første steg", () => {
    const { onBack, rerender } = renderShell({ native: false });
    fireEvent.click(screen.getByRole("button", { name: "Tilbake" }));
    expect(onBack).toHaveBeenCalledOnce();

    rerender(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="title"
        pageTitle="Tittel"
        native={false}
        onBack={vi.fn()}
        onCancel={vi.fn()}
        footer={<button type="button">Fortsett</button>}
        firstStep
      >
        Innhold
      </ListingComposerShell>,
    );
    expect(screen.queryByRole("button", { name: "Tilbake" })).toBeNull();
  });

  it("lar webfooteren være uten native kontrollrad, men viser lukk-knapp i toppstripa", () => {
    const { onCancel } = renderShell({ native: false });
    fireEvent.click(screen.getByRole("button", { name: "Avbryt annonseopprettelse" }));
    expect(onCancel).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Fortsett" })).toBeTruthy();
  });

  it("gjør webfooteren sticky under desktop og statisk fra desktop", () => {
    const { container } = renderShell({ native: false });
    const footer = container.querySelector('[data-composer-footer="web"]');
    expect(footer?.classList.contains("sticky")).toBe(true);
    expect(footer?.classList.contains("bottom-0")).toBe(true);
    expect(footer?.classList.contains("lg:static")).toBe(true);
  });
  it("åpner forhåndsvisningen fra stegraden i et eget panel og gir fokus tilbake ved lukking", async () => {
    const { container } = renderShell({
      native: false,
      preview: <div>Kjøpervisning</div>,
      strength: <div>2 opplysninger må fylles ut</div>,
    });
    const toolbar = container.querySelector('[data-composer-toolbar="desktop"]');
    const trigger = screen.getByRole("button", { name: "Forhåndsvis" });
    expect(toolbar?.contains(trigger)).toBe(true);
    expect(toolbar?.textContent).toContain("2 opplysninger må fylles ut");
    expect(toolbar?.classList.contains("lg:flex")).toBe(true);
    expect(trigger.classList.contains("dock:hidden")).toBe(true);

    fireEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "Slik ser kjøperen annonsen" });
    expect(panel.textContent).toContain("Kjøpervisning");

    fireEvent.keyDown(panel, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("viser forhåndsvisningen fast i telefonrammen og scroller rammen til delen steget redigerer", () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const { container } = renderShell({
        native: false,
        preview: <p data-preview-section="price">1 800 kr</p>,
        previewSection: "price",
      });
      const layout = container.querySelector('[data-composer-layout="preview-dock"]');
      const dock = container.querySelector("[data-composer-preview-dock]");
      expect(layout?.contains(dock)).toBe(true);
      expect(dock?.classList.contains("dock:block")).toBe(true);
      expect(dock?.querySelector("[inert]")?.textContent).toBe("1 800 kr");
      expect(scrollTo).toHaveBeenCalledOnce();
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("utelater forhåndsvisning og annonsestyrke i native og beholder én kolonne", () => {
    const { container } = renderShell({
      native: true,
      preview: <div>Kjøpervisning</div>,
      strength: <div>Klar til publisering</div>,
    });
    expect(container.querySelector('[data-composer-toolbar="desktop"]')).toBeNull();
    expect(screen.queryByRole("button", { name: "Forhåndsvis" })).toBeNull();
    expect(container.querySelector('[data-composer-layout="single-column"]')).toBeTruthy();
    expect(
      container.querySelector('[data-composer-footer="native"]')?.classList.contains("pb-safe"),
    ).toBe(true);
  });

  it("bevarer native safe area og minst 48 piksler treffområde i composerfooteren", () => {
    const { container } = renderShell();
    const footer = container.querySelector('[data-composer-footer="native"]');
    expect(footer?.classList.contains("pb-safe")).toBe(true);
    expect(footer?.classList.contains("sticky")).toBe(false);
    expect(footer?.classList.contains("[&_button]:min-h-12")).toBe(true);
    expect(footer?.classList.contains("[&_button]:min-w-12")).toBe(true);
  });

  it("gir også mobilweb-knappene minst 48 piksler treffområde", () => {
    const { container } = renderShell({ native: false });
    const footer = container.querySelector('[data-composer-footer="web"]');
    expect(footer?.classList.contains("[&_button]:min-h-12")).toBe(true);
    expect(footer?.classList.contains("[&_button]:min-w-12")).toBe(true);
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
