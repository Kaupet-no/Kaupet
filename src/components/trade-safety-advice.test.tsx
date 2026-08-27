// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { TradeSafetyAdvice } from "./trade-safety-advice";

it("viser trygg-handel-råd ved kontakt og bare i en tom første samtale", () => {
  const { rerender } = render(<TradeSafetyAdvice context="contact" />);

  expect(screen.getByRole("note", { name: "Råd for trygg handel" })).toBeTruthy();
  expect(screen.getByText(/forsiktig med forskuddsbetaling/i)).toBeTruthy();
  expect(screen.queryByText(/møt på et offentlig sted/i)).toBeNull();
  expect(screen.queryByText(/kontroller varen før du betaler/i)).toBeNull();

  rerender(<TradeSafetyAdvice context="conversation" messageCount={0} />);
  expect(screen.getByText(/møt på et offentlig sted/i)).toBeTruthy();
  expect(screen.getByText(/kontroller varen før du betaler/i)).toBeTruthy();

  rerender(<TradeSafetyAdvice context="conversation" messageCount={1} />);
  expect(screen.queryByRole("note", { name: "Råd for trygg handel" })).toBeNull();
});
