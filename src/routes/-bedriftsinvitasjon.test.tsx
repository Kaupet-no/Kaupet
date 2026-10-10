// @vitest-environment jsdom
import type { ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  navigate: vi.fn(),
  updateUser: vi.fn(),
  accept: vi.fn(),
  getSession: vi.fn(),
  setSession: vi.fn(),
  signOut: vi.fn(),
  tokens: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options }),
  useNavigate: () => mocks.navigate,
  Link: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  invitationTokens: mocks.tokens,
  supabase: {
    auth: {
      getSession: mocks.getSession,
      setSession: mocks.setSession,
      signOut: mocks.signOut,
      updateUser: mocks.updateUser,
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
    },
  },
}));
const jwt = (sub: string) => `h.${btoa(JSON.stringify({ sub }))}.s`;
vi.mock("@/lib/business/members.functions", () => ({ acceptOrganizationInvite: mocks.accept }));
import { Route } from "./bedriftsinvitasjon";
const InvitationPage = Route.options.component as ComponentType;
afterEach(cleanup);
beforeEach(() => {
  vi.resetAllMocks();
  mocks.updateUser.mockResolvedValue({ error: null });
  mocks.accept.mockResolvedValue({ organizationId: "organization" });
  mocks.getSession.mockResolvedValue({
    data: { session: { user: { id: "invitee" } } },
    error: null,
  });
  mocks.setSession.mockResolvedValue({ error: null });
  mocks.signOut.mockResolvedValue({ error: null });
  mocks.tokens.mockReturnValue(null);
});

it("bytter ikke stille fra en annen innlogget konto til invitasjonskontoen", async () => {
  const tokens = { access_token: jwt("invitee"), refresh_token: "r" };
  mocks.tokens.mockReturnValue(tokens);
  mocks.getSession.mockResolvedValue({ data: { session: { user: { id: "other" } } }, error: null });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InvitationPage />
    </QueryClientProvider>,
  );
  const confirm = await screen.findByRole("button", { name: "Logg ut og fortsett" });
  expect(mocks.setSession).not.toHaveBeenCalled();
  fireEvent.click(confirm);
  await screen.findByLabelText("Nytt passord");
  expect(mocks.signOut).toHaveBeenCalledWith({ scope: "local" });
  expect(mocks.setSession).toHaveBeenCalledWith(tokens);
});

it("tar i bruk invitasjonssesjonen direkte når ingen andre er innlogget", async () => {
  const tokens = { access_token: jwt("invitee"), refresh_token: "r" };
  mocks.tokens.mockReturnValue(tokens);
  mocks.getSession.mockResolvedValue({ data: { session: null }, error: null });
  render(
    <QueryClientProvider client={new QueryClient()}>
      <InvitationPage />
    </QueryClientProvider>,
  );
  await screen.findByLabelText("Nytt passord");
  expect(mocks.setSession).toHaveBeenCalledWith(tokens);
  expect(mocks.signOut).not.toHaveBeenCalled();
});

it("oppdaterer tidligere manglende medlemskap før den åpner bedriftskonsollen", async () => {
  const client = new QueryClient();
  const key = ["business-membership", "invitee"];
  client.setQueryData(key, null);
  let membershipInvalidatedBeforeNavigation = false;
  mocks.navigate.mockImplementation(() => {
    membershipInvalidatedBeforeNavigation = client.getQueryState(key)?.isInvalidated === true;
  });
  render(
    <QueryClientProvider client={client}>
      <InvitationPage />
    </QueryClientProvider>,
  );
  const password = await screen.findByLabelText("Nytt passord");
  fireEvent.change(password, { target: { value: "fiktivt-testpassord" } });
  fireEvent.click(screen.getByRole("button", { name: "Godta invitasjon" }));
  await waitFor(() =>
    expect(mocks.navigate).toHaveBeenCalledWith({
      to: "/bedrift",
      search: { tab: "oversikt" },
      replace: true,
    }),
  );
  expect(membershipInvalidatedBeforeNavigation).toBe(true);
});

it("beholder invitasjonssiden og feilen når aksepten avvises", async () => {
  mocks.accept.mockRejectedValue(new Error("Invitasjonen er ikke lenger tilgjengelig."));
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <InvitationPage />
    </QueryClientProvider>,
  );
  const password = await screen.findByLabelText("Nytt passord");
  fireEvent.change(password, { target: { value: "fiktivt-testpassord" } });
  fireEvent.click(screen.getByRole("button", { name: "Godta invitasjon" }));
  expect(await screen.findByRole("alert")).toHaveProperty(
    "textContent",
    "Invitasjonen er ikke lenger tilgjengelig.",
  );
  expect(mocks.navigate).not.toHaveBeenCalled();
});
