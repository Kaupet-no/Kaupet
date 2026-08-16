// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DiscardListingDialog } from "./discard-listing-dialog";

afterEach(() => {
  cleanup();
});

describe("DiscardListingDialog", () => {
  it("shows a role=alert error and does not call onReset/navigate when saving fails", async () => {
    const onSaveDraft = vi.fn().mockResolvedValue(false);
    const onReset = vi.fn();
    const onDiscard = vi.fn();

    render(
      <DiscardListingDialog
        open
        onReset={onReset}
        onDiscard={onDiscard}
        onSaveDraft={onSaveDraft}
        isSavingDraft={false}
      />,
    );

    expect(screen.queryByRole("alert")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: /lagre som kladd/i }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toMatch(/kunne ikke lagre utkastet/i);
    expect(onReset).not.toHaveBeenCalled();
  });

  it("remounts the alert node on a second consecutive failure so it re-announces", async () => {
    const onSaveDraft = vi.fn().mockResolvedValue(false);

    render(
      <DiscardListingDialog
        open
        onReset={vi.fn()}
        onDiscard={vi.fn()}
        onSaveDraft={onSaveDraft}
        isSavingDraft={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /lagre som kladd/i }));
    const firstAlert = await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: /lagre som kladd/i }));
    // The node must be a fresh DOM element (not a text mutation of the same
    // node) for role="alert" to be re-announced by assistive tech.
    await waitFor(() => {
      expect(screen.getByRole("alert")).not.toBe(firstAlert);
    });
  });

  it("clears the error and proceeds when a retry succeeds", async () => {
    const onSaveDraft = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const onReset = vi.fn();

    render(
      <DiscardListingDialog
        open
        onReset={onReset}
        onDiscard={vi.fn()}
        onSaveDraft={onSaveDraft}
        isSavingDraft={false}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /lagre som kladd/i }));
    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: /lagre som kladd/i }));
    await waitFor(() => {
      expect(screen.queryByRole("alert")).toBeNull();
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(2);
  });
});
