// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { submit } = vi.hoisted(() => ({ submit: vi.fn() }));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const fn = { validator: () => fn, handler: () => vi.fn() };
    return fn;
  },
  useServerFn: () => submit,
}));
vi.mock("@/lib/toast", () => ({
  showErrorToast: vi.fn(),
  showSuccessToast: vi.fn(),
}));

import { CategorySuggestionDialog } from "./category-suggestion-dialog";

afterEach(() => {
  cleanup();
  submit.mockReset();
});

describe("CategorySuggestionDialog", () => {
  it("åpner skjemaet med obligatorisk kategorifelt", () => {
    render(<CategorySuggestionDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Savner du en kategori?" }));

    expect(screen.getByRole("textbox", { name: "Ny kategori" }).getAttribute("required")).toBe("");
    expect(screen.getByRole("textbox", { name: /Hvorfor eller hva/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send forslag" }).hasAttribute("disabled")).toBe(
      true,
    );
  });

  it("sender kategorinavn og valgfri beskrivelse", async () => {
    submit.mockResolvedValue(undefined);
    render(<CategorySuggestionDialog />);

    fireEvent.click(screen.getByRole("button", { name: "Savner du en kategori?" }));
    fireEvent.change(screen.getByRole("textbox", { name: "Ny kategori" }), {
      target: { value: "Brettspill" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /Hvorfor eller hva/ }), {
      target: { value: "Samlekategorien mangler." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Send forslag" }));

    await waitFor(() =>
      expect(submit).toHaveBeenCalledWith({
        data: {
          categoryName: "Brettspill",
          description: "Samlekategorien mangler.",
          pageUrl: expect.any(String),
        },
      }),
    );
    expect(screen.queryByRole("textbox", { name: "Ny kategori" })).toBeNull();
  });
});
