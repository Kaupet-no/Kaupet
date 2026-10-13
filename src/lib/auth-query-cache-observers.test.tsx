// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import type { ReactNode } from "react";
import { afterEach, expect, it } from "vitest";

import { createAuthQueryCacheHandler } from "./auth-query-cache";

afterEach(cleanup);

it("fjerner A sine data og henter B sine i samme monterte komponent (tilstandsovergang)", async () => {
  const qc = new QueryClient({ defaultOptions: { queries: { staleTime: 60_000 } } });
  const handle = createAuthQueryCacheHandler(qc);
  handle("INITIAL_SESSION", { user: { id: "A" } } as Session);
  qc.setQueryData(["my-blocks"], ["A-private"]);
  let resolveB!: (data: string[]) => void;
  const bData = new Promise<string[]>((resolve) => {
    resolveB = resolve;
  });
  const { result } = renderHook(() => useQuery({ queryKey: ["my-blocks"], queryFn: () => bData }), {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  });
  expect(result.current.data).toEqual(["A-private"]);
  act(() => {
    handle("SIGNED_IN", { user: { id: "B" } } as Session);
  });
  await waitFor(() => expect(result.current.data).toBeUndefined());
  await act(async () => {
    resolveB(["B-private"]);
  });
  await waitFor(() => expect(result.current.data).toEqual(["B-private"]));
  qc.clear();
});
