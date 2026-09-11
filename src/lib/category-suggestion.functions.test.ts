import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();

vi.mock("@tanstack/react-start", () => ({
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

import { suggestCategoryForTitle } from "./category-suggestion.functions";

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
