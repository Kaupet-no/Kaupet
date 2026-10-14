// @vitest-environment jsdom
import { forwardRef, useImperativeHandle, type ComponentType } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  search: { mode: "reset" as string, returnTo: undefined },
  resetPasswordForEmail: vi.fn(),
  resend: vi.fn(),
  getResponsePromise: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({ options, useSearch: () => mocks.search }),
  useNavigate: () => vi.fn(),
  Link: () => null,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: mocks.resetPasswordForEmail,
      resend: mocks.resend,
      getUser: async () => ({ data: { user: null } }),
    },
  },
}));
vi.mock("@marsidev/react-turnstile", () => ({
  Turnstile: forwardRef(function Turnstile(_props, ref) {
    useImperativeHandle(ref, () => ({
      getResponsePromise: mocks.getResponsePromise,
      reset: mocks.reset,
    }));
    return null;
  }),
}));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));

import { Route } from "./auth";
const AuthPage = (Route as unknown as { options: { component: ComponentType } }).options.component;

afterEach(() => {
  cleanup();
  vi.unstubAllEnvs();
});
beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "site-key");
  mocks.resetPasswordForEmail.mockReset().mockResolvedValue({ error: null });
  mocks.resend.mockReset().mockResolvedValue({ error: null });
  mocks.getResponsePromise.mockReset().mockResolvedValue("captcha-1");
  mocks.reset.mockReset();
});

// KG-02-F02: med CAPTCHA påkrevd i Supabase Auth avvises e-postkallene uten token.
it("sender CAPTCHA-token med passordreset og henter nytt token etterpå", async () => {
  mocks.search.mode = "reset";
  render(<AuthPage />);
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "kari@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send lenke" }));

  await waitFor(() => expect(mocks.resetPasswordForEmail).toHaveBeenCalled());
  expect(mocks.resetPasswordForEmail.mock.calls[0][1]).toMatchObject({
    captchaToken: "captcha-1",
  });
  await waitFor(() => expect(mocks.reset).toHaveBeenCalled());
});

it("sender CAPTCHA-token når bekreftelses-e-post sendes på nytt", async () => {
  mocks.search.mode = "signin";
  render(<AuthPage />);
  fireEvent.click(screen.getByRole("button", { name: "Send bekreftelse på nytt" }));
  fireEvent.change(screen.getByLabelText("E-post"), { target: { value: "kari@example.com" } });
  fireEvent.click(screen.getByRole("button", { name: "Send bekreftelses-e-post på nytt" }));

  await waitFor(() => expect(mocks.resend).toHaveBeenCalled());
  expect(mocks.resend.mock.calls[0][0].options).toMatchObject({ captchaToken: "captcha-1" });
});
