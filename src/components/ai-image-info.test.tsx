// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiImageBadge } from "./ai-image-info";

vi.mock("@/hooks/use-form-factor", () => ({ useIsNarrow: () => false }));
afterEach(cleanup);

describe("KI-bildemerking", () => {
  it("viser ikke merket uten treff i metadata", () => {
    const { rerender } = render(<AiImageBadge show={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    rerender(<AiImageBadge />);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("forklarer grunnlaget og begrensningene, og lukker med Escape med fokus tilbake (A11Y-04)", async () => {
    const onImageClick = vi.fn();
    render(
      <div onClick={onImageClick}>
        <AiImageBadge show />
      </div>,
    );
    const trigger = screen.getByRole("button", { name: "Merket som KI" });
    trigger.focus();
    fireEvent.click(trigger);
    const dialog = await screen.findByRole("dialog", { name: "Merket som KI-generert" });
    expect(screen.getByText(/Kaupet har ikke verifisert metadataene/)).toBeTruthy();
    expect(screen.getByText(/Bilder uten merke kan også være laget eller/)).toBeTruthy();
    expect(onImageClick).not.toHaveBeenCalled();
    fireEvent.keyDown(dialog, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(document.activeElement).toBe(trigger);
    });
  });
});
