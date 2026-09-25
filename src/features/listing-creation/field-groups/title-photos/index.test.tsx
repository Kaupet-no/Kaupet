// @vitest-environment jsdom

import type { ReactNode } from "react";
import { cleanup, render, screen, fireEvent } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { WizardSharedProps } from "../types";
import { PhotosGroup, TitleGroup } from ".";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: ReactNode }) => <a>{children}</a>,
}));

afterEach(cleanup);

const image = {
  id: "1",
  file: new File(["x"], "a.jpg", { type: "image/jpeg" }),
  thumbFile: new File(["x"], "a.jpg", { type: "image/jpeg" }),
  previewUrl: "blob:fake",
} satisfies WizardSharedProps["images"][number];

const noopPhotoSuggestionProps = {
  setValue: vi.fn(),
  title: "",
  photoSuggestionEnabled: false,
  photoSuggestionStatus: "idle" as const,
  analyzePhotos: vi.fn(),
  photoTitleSuggestion: null,
  dismissPhotoTitleSuggestion: vi.fn(),
};

describe("PhotosGroup", () => {
  it("viser ikke bekreftelsesmeldingen før Neste er trykket uten bilder", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
      />,
    );
    expect(screen.queryByText(/Annonser med bilder får flere henvendelser/)).toBeNull();
  });

  it("viser en inline melding (role=status) etter første Neste uten bilder", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending
        {...noopPhotoSuggestionProps}
      />,
    );
    const message = screen.getByText(/Annonser med bilder får flere henvendelser/);
    expect(message.getAttribute("role")).toBe("status");
  });

  it("skjuler meldingen igjen når et bilde er lagt til", () => {
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending
        {...noopPhotoSuggestionProps}
      />,
    );
    expect(screen.queryByText(/Annonser med bilder får flere henvendelser/)).toBeNull();
  });

  it("skjuler «Foreslå kategori og detaljer»-knappen når funksjonen er av", () => {
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled={false}
      />,
    );
    expect(screen.queryByTestId("photo-suggestion-button")).toBeNull();
  });

  it("deaktiverer knappen når det ikke er noen bilder ennå, selv om funksjonen er på", () => {
    render(
      <PhotosGroup
        images={[]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
      />,
    );
    expect((screen.getByTestId("photo-suggestion-button") as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect(screen.getByText(/Legg til minst ett bilde først/)).toBeTruthy();
  });

  it("fyller en tom tittel direkte med forslaget fra bildene", () => {
    const setValue = vi.fn();
    const dismissPhotoTitleSuggestion = vi.fn();
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        setValue={setValue}
        dismissPhotoTitleSuggestion={dismissPhotoTitleSuggestion}
        photoTitleSuggestion="Grå sofa i stoff"
      />,
    );
    expect(setValue).toHaveBeenCalledWith("title", "Grå sofa i stoff", { shouldValidate: true });
    expect(dismissPhotoTitleSuggestion).toHaveBeenCalled();
  });
});

describe("TitleGroup", () => {
  const titleProps = {
    register: (() => ({ name: "title" })) as unknown as WizardSharedProps["register"],
    errors: {},
    touchedFields: {},
    title: "",
    titleExample: null,
  };

  it("skjuler feltet bak «Jeg vil fylle ut tittel selv» og viser det ved trykk", () => {
    render(<TitleGroup {...titleProps} titleCollapsible />);
    expect(screen.queryByTestId("listing-title-input")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Jeg vil fylle ut tittel selv" }));
    expect(document.activeElement).toBe(screen.getByTestId("listing-title-input"));
  });

  it("viser feltet direkte når det har innhold", () => {
    render(<TitleGroup {...titleProps} title="Sofa" titleCollapsible />);
    expect(screen.getByTestId("listing-title-input")).toBeTruthy();
  });

  it("starter analysen ved trykk og lenker til personvernerklæringen", () => {
    const analyzePhotos = vi.fn();
    render(
      <PhotosGroup
        images={[image]}
        setImages={vi.fn()}
        uploadProgress={null}
        noImageConfirmPending={false}
        {...noopPhotoSuggestionProps}
        photoSuggestionEnabled
        analyzePhotos={analyzePhotos}
      />,
    );
    expect(screen.getByText("personvernerklæringen")).toBeTruthy();
    fireEvent.click(screen.getByTestId("photo-suggestion-button"));
    expect(analyzePhotos).toHaveBeenCalledTimes(1);
  });
});
