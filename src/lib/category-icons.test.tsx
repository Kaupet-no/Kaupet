// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { CategoryIcon } from "./category-icons";

afterEach(cleanup);

// Vakthund for at hele lucide-registeret ikke sniker seg inn i forsidens
// modulgraf igjen. Settet er bevisst begrenset: ikonvelgeren i admin tilbyr
// kun CATEGORY_ICON_OPTIONS, og alt utenfor rendres som Package.
describe("CategoryIcon", () => {
  it("rendrer et kuratert ikon synkront", () => {
    render(<CategoryIcon iconName="Car" data-testid="ikon" />);
    expect(screen.getByTestId("ikon").getAttribute("class")).toContain("lucide-car");
  });

  it("rendrer FlaskConical, som e2e-kategoriene i seed.sql bruker", () => {
    render(<CategoryIcon iconName="FlaskConical" data-testid="ikon" />);
    expect(screen.getByTestId("ikon").getAttribute("class")).toContain("lucide-flask-conical");
  });

  it("faller tilbake til Package for navn utenfor det kuraterte settet", () => {
    render(<CategoryIcon iconName="Sparkles" data-testid="ikon" />);
    expect(screen.getByTestId("ikon").getAttribute("class")).toContain("lucide-package");
  });

  it("faller tilbake til Package når navnet mangler", () => {
    render(<CategoryIcon iconName={null} data-testid="ikon" />);
    expect(screen.getByTestId("ikon").getAttribute("class")).toContain("lucide-package");
  });
});
