// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CategoryIcon } from "./category-icons";

afterEach(cleanup);

// Vakthund for at hele lucide-registeret ikke sniker seg inn i forsidens
// modulgraf igjen: kuraterte ikoner må rendres synkront, mens alt annet skal
// lastes latt av DynamicIcon. Ryker fallbacken, faller ikonvalg som admin har
// gjort utenfor det kuraterte settet stille tilbake til Package-ikonet.
describe("CategoryIcon", () => {
  it("rendrer et kuratert ikon synkront", () => {
    render(<CategoryIcon iconName="Car" data-testid="ikon" />);
    expect(screen.getByTestId("ikon").getAttribute("class")).toContain("lucide-car");
  });

  it("laster ikoner utenfor det kuraterte settet latt, med PascalCase til kebab-case", async () => {
    render(<CategoryIcon iconName="Sparkles" data-testid="ikon" />);
    // Package-reserven vises til det late oppslaget er ferdig; deretter er det
    // det ekte ikonet. DynamicIcon setter kun "lucide" som klasse, ikke
    // "lucide-<navn>", så fraværet av lucide-package er signalet vi har.
    await waitFor(() =>
      expect(screen.getByTestId("ikon").getAttribute("class")).not.toContain("lucide-package"),
    );
  });

  it("faller tilbake til Package når navnet mangler", () => {
    render(<CategoryIcon iconName={null} data-testid="ikon" />);
    expect(screen.getByTestId("ikon").getAttribute("class")).toContain("lucide-package");
  });
});
