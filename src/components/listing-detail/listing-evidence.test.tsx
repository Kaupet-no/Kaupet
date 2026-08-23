// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";

import { ListingEvidence } from "./listing-evidence";

it("viser tekstlig kilde og bare dokumenterte tidspunkt", () => {
  const { container } = render(
    <ListingEvidence
      sources={[
        { source: "registry", timestamp: null },
        { source: "seller", timestamp: null },
        { source: "kaupet", timestamp: "2024-03-12T10:30:00.000Z" },
        { source: "unknown", timestamp: null },
      ]}
    />,
  );

  expect(screen.getByText("Kjøretøydata fra Statens vegvesen")).toBeTruthy();
  expect(screen.getByText("Opplysninger gitt av selger")).toBeTruthy();
  expect(screen.getByText("Kontoopplysninger fra Kaupet")).toBeTruthy();
  expect(screen.getByText("Kilden til opplysningen er ukjent")).toBeTruthy();
  expect(screen.getByText("Registrert 12. mars 2024")).toBeTruthy();
  expect(container.querySelectorAll("time")).toHaveLength(1);
});
