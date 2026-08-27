import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({
          data: [
            { id: "vehicle", slug: "bil-og-mc", name_nb: "Bil og MC", parent_id: null },
            { id: "bil", slug: "bil", name_nb: "Bil", parent_id: "vehicle" },
            {
              id: "motorcycle",
              slug: "motorsykkel",
              name_nb: "Motorsykkel",
              parent_id: "vehicle",
            },
          ],
          error: null,
        })),
      })),
    })),
  },
}));

import { suggestCategoryForTitleAi } from "./category-suggestion-ai.server";

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.MISTRAL_API_KEY;
  vi.unstubAllGlobals();
});

describe("suggestCategoryForTitleAi", () => {
  it("calls Mistral Small 4 without reasoning and maps returned slugs", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"categories":["bil"]}' } }] }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      ),
    );

    const result = await suggestCategoryForTitleAi({ title: "Volvo XC40 2019 diesel" });

    expect(result).toEqual([
      expect.objectContaining({ category_id: "bil", slug: "bil", name_nb: "Bil" }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(request.body as string);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.eu.mistral.ai/v1/chat/completions");
    expect(body).toMatchObject({
      model: "mistral-small-2603",
      reasoning_effort: "none",
      temperature: 0,
      max_tokens: 32,
      response_format: {
        type: "json_schema",
        json_schema: { name: "category_suggestion", strict: true },
      },
    });
    expect(body.messages[0].content).toContain("[bil]");
  });

  it("rejects a category slug that is not in the database", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"categories":["unknown"]}' } }] }),
        {
          status: 200,
        },
      ),
    );

    await expect(suggestCategoryForTitleAi({ title: "Ukjent produkt" })).resolves.toBeNull();
  });

  it("returns null when Mistral times out", async () => {
    fetchMock.mockRejectedValue(new DOMException("timed out", "TimeoutError"));

    await expect(suggestCategoryForTitleAi({ title: "Volvo XC40" })).resolves.toBeNull();
  });

  it("does not call Mistral without a configured key", async () => {
    delete process.env.MISTRAL_API_KEY;

    await expect(suggestCategoryForTitleAi({ title: "Volvo XC40" })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
