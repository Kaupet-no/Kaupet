import { describe, expect, it, vi } from "vitest";

import { fetchAllPagesByIds, ID_CHUNK_SIZE, PAGE_SIZE } from "./fetch-all-pages";

describe("fetchAllPagesByIds", () => {
  it("deler ID-ene i biter og paginerer hver bit (KG-06-F02)", async () => {
    const ids = Array.from({ length: ID_CHUNK_SIZE + 1 }, (_, i) => `id-${i}`);
    const page = vi.fn(async (chunk: string[], from: number) => ({
      // Første bit har én full side og én kort side.
      data:
        chunk.length === ID_CHUNK_SIZE && from === 0 ? Array(PAGE_SIZE).fill(chunk[0]) : [chunk[0]],
      error: null,
    }));

    const result = await fetchAllPagesByIds(ids, page);

    expect(page.mock.calls.map(([chunk, from]) => [chunk.length, from])).toEqual([
      [ID_CHUNK_SIZE, 0],
      [ID_CHUNK_SIZE, PAGE_SIZE],
      [1, 0],
    ]);
    expect(result.data).toHaveLength(PAGE_SIZE + 2);
  });

  it("stopper og returnerer feilen fra en bit", async () => {
    const error = { message: "timeout" };
    const result = await fetchAllPagesByIds(["a"], async () => ({ data: null, error }));
    expect(result).toEqual({ data: null, error });
  });
});
