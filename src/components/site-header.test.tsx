// @vitest-environment jsdom
import { act } from "react";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { hydrateRoot, type Root } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { SiteHeader, HeaderSearchPortal } from "./site-header";

type HeaderMembership = {
  status: "active" | "deactivated";
  organization: { selected_plan: "proff_basis" | "proff" | null };
};

const headerMocks = vi.hoisted(() => ({
  user: { id: "user-id", email: "user@example.test" } as { id: string; email: string } | null,
  membership: null as HeaderMembership | null,
  openPanel: vi.fn(),
}));

vi.mock("@tanstack/react-router", () => ({
  Link: ({
    to,
    children,
    ...props
  }: {
    to: string;
    children?: ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={to} {...props}>
      {children}
    </a>
  ),
}));
vi.mock("@/hooks/use-auth", () => ({
  useAuth: () => ({ user: headerMocks.user, session: null, loading: false }),
}));
vi.mock("@/features/business-account/use-business-membership", () => ({
  useBusinessMembership: () => ({ data: headerMocks.membership }),
}));
vi.mock("@/features/listing-search/search-panel/search-panel-context", () => ({
  useSearchPanel: () => ({ openPanel: headerMocks.openPanel }),
}));
vi.mock("@/hooks/use-unread", () => ({ useUnreadConversationsCount: () => 0 }));
vi.mock("@/components/user-menu", () => ({ UserMenu: () => <span /> }));
vi.mock("@/components/notifications-bell", () => ({ NotificationsBell: () => <span /> }));
vi.mock("@/lib/product-analytics", () => ({ trackProductEvent: vi.fn() }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT =
  true;

afterEach(() => {
  cleanup();
  document.body.replaceChildren();
  headerMocks.membership = null;
});

describe("HeaderSearchPortal", () => {
  it("hydrerer uten avvik og beholder søkefeltet gjennom sticky-overgangen", async () => {
    const serverHtml = renderToString(
      <HeaderSearchPortal>
        <input aria-label="Søk i annonser" />
      </HeaderSearchPortal>,
    );
    const app = document.createElement("div");
    const slot = document.createElement("div");
    slot.id = "header-search-slot";
    app.innerHTML = serverHtml;
    document.body.append(app, slot);
    const hydrationErrors: unknown[] = [];
    let root!: Root;

    await act(async () => {
      root = hydrateRoot(
        app,
        <HeaderSearchPortal>
          <input aria-label="Søk i annonser" />
        </HeaderSearchPortal>,
        { onRecoverableError: (error) => hydrationErrors.push(error) },
      );
    });

    const input = await waitFor(() => {
      const element = slot.querySelector<HTMLInputElement>('input[aria-label="Søk i annonser"]');
      expect(element).not.toBeNull();
      return element!;
    });
    input.value = "sykkel";
    input.focus();

    await act(async () => {
      root.render(
        <HeaderSearchPortal>
          <input aria-label="Søk i annonser" aria-hidden />
        </HeaderSearchPortal>,
      );
    });

    expect(hydrationErrors).toEqual([]);
    expect(slot.querySelector("input")).toBe(input);
    expect(input.value).toBe("sykkel");
    expect(document.activeElement).toBe(input);

    await act(async () => root.unmount());
  });
});

describe("SiteHeader", () => {
  it("viser Proff basis-logoen for en aktiv bedrift med Proff basis", () => {
    headerMocks.membership = {
      status: "active",
      organization: { selected_plan: "proff_basis" },
    };

    render(<SiteHeader />);

    expect(screen.getByText("kaupet")).toBeTruthy();
    expect(screen.getByText("Proff")).toBeTruthy();
    expect(screen.getByText("Basis")).toBeTruthy();
  });

  it("viser Proff-logoen for en aktiv bedrift med Proff", () => {
    headerMocks.membership = {
      status: "active",
      organization: { selected_plan: "proff" },
    };

    render(<SiteHeader />);

    expect(screen.getByText("Proff")).toBeTruthy();
    expect(screen.queryByText("Basis")).toBeNull();
  });

  it("viser vanlig Kaupet-logo når bedriftstilknytningen ikke er aktiv", () => {
    headerMocks.membership = {
      status: "deactivated",
      organization: { selected_plan: "proff" },
    };

    render(<SiteHeader />);

    expect(screen.getByText("kaupet")).toBeTruthy();
    expect(screen.getByText("no")).toBeTruthy();
    expect(screen.queryByText("Proff")).toBeNull();
  });
});
