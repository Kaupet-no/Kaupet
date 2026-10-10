// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ListingComposerShell } from "./listing-composer-shell";

vi.mock("@/components/native-page-header", () => ({
  NativePageHeader: ({ right, center }: { right?: ReactNode; center?: ReactNode }) => (
    <header>
      {center ?? "Ny annonse"}
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
  it("beholder fokus når brukeren begynner å skrive før stegets fokusramme kjører", () => {
    let focusPage: FrameRequestCallback | undefined;
    const frame = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
      focusPage = callback;
      return 1;
    });
    try {
      render(
        <ListingComposerShell
          title="Ønskes kjøpt"
          pageKey="details"
          pageTitle="Siste detaljer"
          native={false}
          onCancel={vi.fn()}
          firstStep={false}
          footer={null}
        >
          <label htmlFor="price">Maks pris</label>
          <input id="price" type="number" />
        </ListingComposerShell>,
      );
      const input = screen.getByLabelText("Maks pris");
      input.focus();
      fireEvent.input(input, { target: { value: "1" } });
      focusPage?.(0);
      expect(document.activeElement).toBe(input);
    } finally {
      frame.mockRestore();
    }
  });

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

  it("flytter fremdriftsviseren inn i headeren når native-kortet scrolles", () => {
    render(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="title"
        pageTitle="Tittel"
        native
        onCancel={vi.fn()}
        progress={<span>Steg 2 av 5</span>}
        footer={null}
        firstStep={false}
      >
        Innhold
      </ListingComposerShell>,
    );
    const header = screen.getByRole("banner");
    const card = screen.getByTestId("composer-page-title");
    expect(header.textContent).not.toContain("Steg 2 av 5");

    card.scrollTop = 40;
    fireEvent.scroll(card);
    expect(header.textContent).toContain("Steg 2 av 5");
    expect(header.textContent).not.toContain("Ny annonse");
    expect(screen.getAllByText("Steg 2 av 5")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Avbryt annonseopprettelse" })).toBeTruthy();

    card.scrollTop = 0;
    fireEvent.scroll(card);
    expect(header.textContent).toContain("Ny annonse");
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

  it("holder Turnstile-utfordringen i rulleområdet og Neste i footeren", () => {
    const { container } = render(
      <ListingComposerShell
        title="Ny annonse"
        pageKey="photos"
        pageTitle="Bilder"
        native
        onCancel={vi.fn()}
        footer={<button type="button">Neste</button>}
        challenge={<div role="group" aria-label="Cloudflare-verifisering" />}
        firstStep={false}
      >
        Bilder
      </ListingComposerShell>,
    );
    const scroll = container.querySelector('[data-composer-scroll="true"]');
    const footer = container.querySelector('[data-composer-footer="native"]');
    expect(scroll?.contains(screen.getByRole("group", { name: "Cloudflare-verifisering" }))).toBe(
      true,
    );
    expect(footer?.contains(screen.getByRole("button", { name: "Neste" }))).toBe(true);
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

  it("scroller telefonrammen til delen som endres når brukeren redigerer skjemaet", async () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const { container } = renderShell({
        native: false,
        preview: (
          <>
            <p data-preview-section="price">1 800 kr</p>
            <p data-testid="shipping">Frakt: 99 kr</p>
          </>
        ),
        previewSection: "price",
      });
      const shipping = screen.getByTestId("shipping");
      shipping.getBoundingClientRect = () =>
        ({ top: 900, bottom: 920, width: 200, height: 20 }) as DOMRect;
      scrollTo.mockClear();

      // Endringer i forhåndsvisningen uten redigering (f.eks. bilder som lastes) flytter ikke rammen.
      shipping.textContent = "Frakt: 129 kr";
      await Promise.resolve();
      expect(scrollTo).not.toHaveBeenCalled();

      fireEvent.input(container.querySelector('[data-testid="composer-page-title"]')!);
      shipping.textContent = "Frakt: 149 kr";
      await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce());
    } finally {
      HTMLElement.prototype.scrollTo = original;
    }
  });

  it("scroller endrede felt fram over den faste bunnlinjen, ikke bak den", async () => {
    const scrollTo = vi.fn();
    const original = HTMLElement.prototype.scrollTo;
    HTMLElement.prototype.scrollTo = scrollTo;
    try {
      const { container } = renderShell({
        native: false,
        preview: (
          <>
            <p data-testid="location">Oslo</p>
            <div data-preview-sticky-bottom>1 800 kr</div>
          </>
        ),
      });
      const frame = container.querySelector<HTMLElement>("[data-phone-frame] > div")!;
      frame.getBoundingClientRect = () => ({ top: 0, bottom: 600, height: 600 }) as DOMRect;
      const sticky = container.querySelector<HTMLElement>("[data-preview-sticky-bottom]")!;
      Object.defineProperty(sticky, "offsetHeight", { value: 60 });
      // Innenfor rammen, men bak bunnlinjen (540–600).
      const location = screen.getByTestId("location");
      location.getBoundingClientRect = () =>
        ({ top: 560, bottom: 580, width: 200, height: 20 }) as DOMRect;

      fireEvent.input(container.querySelector('[data-testid="composer-page-title"]')!);
      location.textContent = "Bergen";
      await waitFor(() => expect(scrollTo).toHaveBeenCalledOnce());
      // 580 − (600 − 60) + 16
      expect(scrollTo.mock.calls[0][0]).toMatchObject({ top: 56 });

      // Prisen i bunnlinjen er alltid synlig og flytter ikke rammen.
      scrollTo.mockClear();
      fireEvent.input(container.querySelector('[data-testid="composer-page-title"]')!);
      sticky.textContent = "1 900 kr";
      await Promise.resolve();
      expect(scrollTo).not.toHaveBeenCalled();
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
