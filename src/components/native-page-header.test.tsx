// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { NativePageHeader } from "./native-page-header";

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  useRouter: () => ({ history: { back: vi.fn() } }),
}));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => true }));
vi.mock("@/hooks/use-scroll-fade-opacity", () => ({ useScrollFadeOpacity: () => 1 }));

describe("NativePageHeader", () => {
  it("beholder innholdstittelen som eneste h1 når headertittelen toner inn", () => {
    render(
      <>
        <NativePageHeader title="Volvo XC60" titleFadesIn />
        <main>
          <h1>Volvo XC60</h1>
        </main>
      </>,
    );

    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(document.querySelectorAll("h1")).toHaveLength(1);
  });
});
