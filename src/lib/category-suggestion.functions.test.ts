import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
  createIsomorphicFn: () => ({
    server: (fn: (...args: unknown[]) => unknown) =>
      Object.assign(fn, {
        client: (clientFn: (...args: unknown[]) => unknown) => clientFn,
      }),
  }),
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler: ((input: { data: { title: string } }) => unknown) | undefined;
    const fn = (input: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({ data: validator(input.data) as { title: string } });
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

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: rpcMock },
}));
vi.mock("@/lib/rate-limit.server", () => ({ assertNotRateLimited: vi.fn() }));

import {
  prefetchCategorySuggestion,
  suggestCategoryForTitle,
} from "./category-suggestion.functions";

beforeEach(() => {
  rpcMock.mockReset();
});

describe("suggestCategoryForTitle", () => {
  it("avviser lav stemmemengde selv ved enstemmig forslag", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          category_id: "bil",
          slug: "bil",
          name_nb: "Bil",
          parent_id: null,
          parent_name_nb: null,
          votes: 2,
        },
      ],
      error: null,
    });

    await expect(suggestCategoryForTitle({ data: { title: "Volvo" } })).resolves.toEqual({
      suggestions: [],
    });
  });

  it("returnerer et forslag med tilstrekkelig mengde og andel", async () => {
    rpcMock.mockResolvedValue({
      data: [
        {
          category_id: "bil",
          slug: "bil",
          name_nb: "Bil",
          parent_id: null,
          parent_name_nb: null,
          votes: 5,
        },
        {
          category_id: "mc",
          slug: "mc",
          name_nb: "MC",
          parent_id: null,
          parent_name_nb: null,
          votes: 3,
        },
      ],
      error: null,
    });

    await expect(suggestCategoryForTitle({ data: { title: "Volvo" } })).resolves.toEqual({
      suggestions: [expect.objectContaining({ category_id: "bil", confidence: 0.625 })],
    });
  });
});

describe("prefetchCategorySuggestion", () => {
  it("cacher ikke en feilet forespørsel; neste kall prøver på nytt", async () => {
    const row = {
      category_id: "bil",
      slug: "bil",
      name_nb: "Bil",
      parent_id: null,
      parent_name_nb: null,
      votes: 20,
    };
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { message: "boom" } })
      .mockResolvedValueOnce({ data: [row], error: null });

    await expect(prefetchCategorySuggestion("Retry-tittel")).resolves.toEqual({ suggestions: [] });
    const retry = await prefetchCategorySuggestion("Retry-tittel");
    expect(retry.suggestions).toHaveLength(1);
    expect(rpcMock).toHaveBeenCalledTimes(2);
  });
});
