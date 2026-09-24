// @vitest-environment jsdom
import type { ReactNode } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

// Radix Select measures its trigger; jsdom has no ResizeObserver.
globalThis.ResizeObserver ??= class {
  observe() {}
  unobserve() {}
  disconnect() {}
} as typeof ResizeObserver;

const listApiKeysMock = vi.fn();
const createApiKeyMock = vi.fn();
const revokeApiKeyMock = vi.fn();
const getIntegrationUsageMock = vi.fn();
vi.mock("@/features/business-account/api-keys.functions", () => ({
  listApiKeys: (...args: unknown[]) => listApiKeysMock(...args),
  createApiKey: (...args: unknown[]) => createApiKeyMock(...args),
  revokeApiKey: (...args: unknown[]) => revokeApiKeyMock(...args),
  getIntegrationUsage: (...args: unknown[]) => getIntegrationUsageMock(...args),
}));

vi.mock("@/features/listing-bulk-import/ImportHistory", () => ({
  ImportHistory: () => <div data-testid="import-history" />,
}));

// Avoid pulling in business-profile-form.tsx's transitive imports
// (storage.functions.ts → createMiddleware, image compression, …), which are
// unrelated to this component and would otherwise need their own mocks.
vi.mock("@/features/business-account/business-profile-form", () => ({
  PanelSection: ({
    title,
    description,
    children,
    footer,
  }: {
    title?: string;
    description?: string;
    children: ReactNode;
    footer?: ReactNode;
  }) => (
    <section>
      {title && <h3>{title}</h3>}
      {description && <p>{description}</p>}
      {children}
      {footer}
    </section>
  ),
}));

import { IntegrationsPanel } from "./integrations-panel";
import { formatLimit, INTEGRATION_LIMITS } from "@/lib/integration-limits";
import type { BusinessLocation } from "@/features/business-account/use-business-membership";

const organizationId = "11111111-1111-4111-8111-111111111111";
const location: BusinessLocation = {
  id: "22222222-2222-4222-8222-222222222222",
  organization_id: organizationId,
  name: "Hovedkontor",
  address_line: null,
  postal_code: null,
  city: null,
  lat: null,
  lng: null,
  is_default: true,
  active: true,
  show_visiting_address: false,
  contacts: [],
  created_at: "2026-01-01T00:00:00.000Z",
  updated_at: "2026-01-01T00:00:00.000Z",
  permissions: {
    role: "manager",
    listingAccess: "all",
    listingEditScope: "all",
    chatAccess: "all",
  },
};

function emptyUsage() {
  return {
    keys: [],
    organization: { newListingsToday: 3, newImagesToday: 5, imagesProcessing: 1, imagesFailed: 2 },
    limits: INTEGRATION_LIMITS,
  };
}

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <IntegrationsPanel organizationId={organizationId} locations={[location]} />
    </QueryClientProvider>,
  );
}

afterEach(cleanup);
beforeEach(() => {
  listApiKeysMock.mockReset().mockResolvedValue({ keys: [] });
  createApiKeyMock.mockReset();
  revokeApiKeyMock.mockReset().mockResolvedValue(undefined);
  getIntegrationUsageMock.mockReset().mockResolvedValue(emptyUsage());
});

describe("IntegrationsPanel", () => {
  it("shows limits and usage read from the shared configuration module", async () => {
    renderPanel();
    await screen.findByText("Grenser og forbruk");
    const normalize = (value: string) => value.replace(/\s+/g, " ").trim();
    const newListingsLimit = normalize(
      formatLimit(INTEGRATION_LIMITS.organization.newListingsPerDay, ""),
    );
    const newImagesLimit = normalize(
      formatLimit(INTEGRATION_LIMITS.organization.newImagesPerDay, ""),
    );
    await waitFor(() => {
      expect(
        screen.getByText((text) => normalize(text) === `3 / ${newListingsLimit}`),
      ).toBeTruthy();
      expect(screen.getByText((text) => normalize(text) === `5 / ${newImagesLimit}`)).toBeTruthy();
      expect(screen.getByText(/1 behandles/)).toBeTruthy();
      expect(screen.getByText(/2 feilet/)).toBeTruthy();
    });
  });

  it("shows the plaintext key exactly once after creation", async () => {
    createApiKeyMock.mockResolvedValue({
      key: {
        id: "key-1",
        name: "Lagersystem",
        keyPrefix: "kpt_live_ab12",
        defaultLocationId: location.id,
        scopes: ["listings:read"],
        createdAt: "2026-09-24T00:00:00.000Z",
        expiresAt: "2026-12-23T00:00:00.000Z",
        lastUsedAt: null,
        revokedAt: null,
      },
      plaintext: "kpt_live_super-secret-value",
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: /Opprett nøkkel/ }));
    fireEvent.change(screen.getByLabelText("Navn"), { target: { value: "Lagersystem" } });
    fireEvent.click(screen.getByRole("button", { name: "Opprett nøkkel" }));

    await waitFor(() => expect(createApiKeyMock).toHaveBeenCalled());
    expect(createApiKeyMock).toHaveBeenCalledWith({
      data: {
        name: "Lagersystem",
        defaultLocationId: location.id,
        scopes: ["listings:read"],
        lifetimeDays: INTEGRATION_LIMITS.apiKey.defaultLifetimeDays,
      },
    });

    await screen.findByText("kpt_live_super-secret-value");
    expect(screen.getByText(/vises ikke igjen/)).toBeTruthy();

    // Two "Lukk" buttons exist in the overlay: the dialog's own X close
    // button (sr-only label) and our explicit footer button — the footer one
    // is the last in DOM order.
    const closeButtons = screen.getAllByRole("button", { name: "Lukk" });
    fireEvent.click(closeButtons[closeButtons.length - 1]!);
    await waitFor(() => expect(screen.queryByText("kpt_live_super-secret-value")).toBeNull());
  });

  it("disables 'Opprett nøkkel' once the organization has 2 active keys", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    listApiKeysMock.mockResolvedValue({
      keys: [
        {
          id: "key-1",
          name: "Første",
          keyPrefix: "kpt_live_aaaa",
          defaultLocationId: location.id,
          scopes: ["listings:read"],
          createdAt: future,
          expiresAt: future,
          lastUsedAt: null,
          revokedAt: null,
        },
        {
          id: "key-2",
          name: "Andre",
          keyPrefix: "kpt_live_bbbb",
          defaultLocationId: location.id,
          scopes: ["listings:read"],
          createdAt: future,
          expiresAt: future,
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    });
    renderPanel();

    await waitFor(() => {
      const button = screen.getByRole("button", { name: /Opprett nøkkel/ });
      expect(button.hasAttribute("disabled")).toBe(true);
    });
    expect(screen.getByText(/Dere har allerede 2 aktive nøkler/)).toBeTruthy();
  });

  it("revokes a key through the AlertDialog confirmation", async () => {
    const future = new Date(Date.now() + 30 * 86_400_000).toISOString();
    listApiKeysMock.mockResolvedValue({
      keys: [
        {
          id: "key-1",
          name: "Første",
          keyPrefix: "kpt_live_aaaa",
          defaultLocationId: location.id,
          scopes: ["listings:read"],
          createdAt: future,
          expiresAt: future,
          lastUsedAt: null,
          revokedAt: null,
        },
      ],
    });
    renderPanel();

    fireEvent.click(await screen.findByRole("button", { name: "Tilbakekall" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Tilbakekall" }));

    await waitFor(() =>
      expect(revokeApiKeyMock).toHaveBeenCalledWith({ data: { keyId: "key-1" } }),
    );
  });
});
