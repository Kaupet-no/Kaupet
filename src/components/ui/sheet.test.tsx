// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Sheet, SheetContent } from "./sheet";

describe("SheetContent (bunn, ikke-expandable)", () => {
  it("gir innholdscontaineren et høydetak og overflow-y-auto slik at høyt innhold kan scrolle", () => {
    render(
      <Sheet open onOpenChange={() => {}}>
        <SheetContent side="bottom">
          <div data-testid="tall-content" style={{ height: 700 }}>
            Innhold høyere enn viewporten
          </div>
        </SheetContent>
      </Sheet>,
    );

    const content = screen.getByTestId("tall-content");
    const scrollContainer = content.parentElement;

    // jsdom gjør ikke ekte layout (ingen reflow/paint), så `scrollHeight >
    // clientHeight` er alltid 0 > 0 der og fanger ikke noe. Det som faktisk er
    // observerbart i jsdom er hvilke klasser/inline-stiler som er satt på
    // riktig node — derfor asserterer denne testen på styling, ikke på målt
    // geometri.
    expect(scrollContainer?.className).toMatch(/overflow-y-auto/);

    const drawerContent = scrollContainer?.closest('[class*="fixed"]');
    expect(drawerContent?.className).toMatch(/max-h-\[92dvh\]/);
  });
});
