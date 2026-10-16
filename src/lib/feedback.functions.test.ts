import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: unknown }) => unknown) | undefined;
    const fn = async (input: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data) });
    };
    Object.assign(fn, {
      validator: (next: typeof validator) => {
        validator = next;
        return fn;
      },
      handler: (next: typeof handler) => {
        handler = next;
        return fn;
      },
    });
    return fn;
  },
}));
vi.mock("@tanstack/react-start/server", () => ({ getRequest: () => undefined }));
vi.mock("@/integrations/supabase/admin", () => ({
  getSupabaseAdmin: async () => ({ rpc: rpcMock }),
}));
vi.mock("@/lib/request-ip.server", () => ({
  hashRequestIp: async () => "ip-hash",
  sha256Hex: async () => "user-hash",
}));

import { submitCategorySuggestion, submitFeedback } from "./feedback.functions";

beforeEach(() => {
  rpcMock.mockReset();
  rpcMock.mockResolvedValue({ error: null });
});

describe("feedback page URL", () => {
  it("stores only the sanitized route for a raw URL sent directly", async () => {
    await submitFeedback({
      data: {
        type: "ris",
        message: "Hei",
        pageUrl: "https://kaupet.no/360-opptak/hemmelig?q=privat#x",
      },
    });
    expect(rpcMock.mock.calls[0]?.[1]).toMatchObject({ _page_url: "/360-opptak/:token" });
  });

  it("sanitizes category suggestions too", async () => {
    await submitCategorySuggestion({
      data: { categoryName: "Båt", pageUrl: "https://kaupet.no/sok?q=privat" },
    });
    expect(rpcMock.mock.calls[0]?.[1]).toMatchObject({ _page_url: "/sok" });
  });
});
