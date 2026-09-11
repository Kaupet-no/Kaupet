import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => ({
      select: vi.fn(() => ({
        eq: vi.fn(async () => ({
          data:
            table === "categories"
              ? [
                  { id: "vehicle", slug: "bil-og-mc", name_nb: "Bil og MC", parent_id: null },
                  { id: "bil", slug: "bil", name_nb: "Bil", parent_id: "vehicle" },
                  {
                    id: "motorcycle",
                    slug: "motorsykkel",
                    name_nb: "Motorsykkel",
                    parent_id: "vehicle",
                  },
                ]
              : null,
          error: null,
        })),
        in: vi.fn(async () => ({
          data: [
            {
              id: "year-filter",
              category_id: "vehicle",
              key: "year",
              label_nb: "Årsmodell",
              type: "number",
              unit: null,
              options: null,
              sort_order: 1,
              is_primary: true,
              depends_on_key: null,
              depends_on_value: null,
              depends_on_not_value: null,
              is_optional: false,
            },
            {
              id: "color-filter",
              category_id: "bil",
              key: "color",
              label_nb: "Farge",
              type: "select",
              unit: null,
              options: [{ value: "black", label_nb: "Svart" }],
              sort_order: 1,
              is_primary: true,
              depends_on_key: null,
              depends_on_value: null,
              depends_on_not_value: null,
              is_optional: false,
            },
          ],
          error: null,
        })),
      })),
    })),
  },
}));

import {
  suggestCategoryForTitleAi,
  suggestListingFromPhotosAi,
} from "./category-suggestion-ai.server";

const fetchMock = vi.fn();

beforeEach(() => {
  process.env.MISTRAL_API_KEY = "test-key";
  process.env.MISTRAL_PHOTO_SUGGESTIONS_ENABLED = "true";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  delete process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_PHOTO_SUGGESTIONS_ENABLED;
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

describe("suggestListingFromPhotosAi", () => {
  it("sends bounded image content and validates returned categories", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ choices: [{ message: { content: '{"categories":["bil"]}' } }] }),
        { status: 200 },
      ),
    );

    const result = await suggestListingFromPhotosAi({
      operation: "identify",
      title: "Volvo",
      images: [{ mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" }],
    });

    expect(result).toEqual({
      status: "pending",
      source: "photo-ai",
      categories: [expect.objectContaining({ slug: "bil" })],
    });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(request.body as string);
    expect(body.messages[0].content).toHaveLength(2);
    expect(body.messages[0].content[1]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/jpeg;base64,AAAA" },
    });
    expect(body.response_format.json_schema.strict).toBe(true);
  });
  it("bruker arvede filtre for attributtforslag", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '{"attributes":[{"key":"year","value":2020},{"key":"color","value":"black"}]}',
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const result = await suggestListingFromPhotosAi({
      operation: "attributes",
      categorySlug: "bil",
      images: [{ mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" }],
    });

    expect(result).toEqual({
      status: "pending",
      source: "photo-ai",
      attributes: [
        { key: "year", value: 2020 },
        { key: "color", value: "black" },
      ],
    });
    const [, request] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(request.body as string);
    expect(body.messages[0].content[0].text).toContain("year");
    expect(body.messages[0].content[0].text).toContain("color");
  });

  it("falls back without contacting Mistral for too many or oversized images", async () => {
    const oversized = `data:image/jpeg;base64,${"A".repeat(204_800)}`;
    const result = await suggestListingFromPhotosAi({
      operation: "identify",
      images: [
        { mime: "image/jpeg", dataUrl: oversized },
        { mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" },
        { mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" },
        { mime: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" },
      ],
    });

    expect(result).toEqual({
      status: "unavailable",
      source: "photo-ai",
      categories: [],
      attributes: [],
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
