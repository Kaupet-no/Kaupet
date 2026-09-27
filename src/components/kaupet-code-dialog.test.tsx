// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

import { KaupetCodeForm } from "./kaupet-code-dialog";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@/lib/toast", () => ({ showErrorToast: vi.fn() }));

afterEach(cleanup);

it("fjerner ikke-sifre, fokuserer når den åpnes og går til annonsen med 8 sifre", () => {
  const onDone = vi.fn();
  const { rerender } = render(<KaupetCodeForm onDone={onDone} />);
  const input = screen.getByLabelText("Kaupet-kode") as HTMLInputElement;
  expect(document.activeElement).not.toBe(input);

  rerender(<KaupetCodeForm autoFocus onDone={onDone} />);
  expect(document.activeElement).toBe(input);

  fireEvent.change(input, { target: { value: "1234-5678" } });
  expect(input.value).toBe("12345678");
  fireEvent.click(screen.getByRole("button", { name: "Gå til annonse" }));

  expect(onDone).toHaveBeenCalled();
  expect(navigate).toHaveBeenCalledWith({
    to: "/$kaupetCode",
    params: { kaupetCode: "12345678" },
  });
});
