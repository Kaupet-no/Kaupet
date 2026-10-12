import { QueryClient, QueryObserver } from "@tanstack/react-query";
import type { Session } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { createAuthQueryCacheHandler } from "./auth-query-cache";

const session = (id: string) => ({ user: { id } }) as Session;

function seed(qc: QueryClient) {
  qc.setQueryData(["current-user"], { id: "A", email: "a@example.test" });
  qc.setQueryData(["my-blocks"], [{ blocked_id: "X" }]);
}

// KG-01-F01: utlogging fra desktopmenyen tømte ikke cachen, så B kunne se A
// sine private data mens B sine lastet.
describe("createAuthQueryCacheHandler", () => {
  it("tømmer cachen når A logger ut, uansett utloggingsvei", () => {
    const qc = new QueryClient();
    const handle = createAuthQueryCacheHandler(qc);
    handle("INITIAL_SESSION", session("A"));
    seed(qc);

    expect(handle("SIGNED_OUT", null)).toBe("cleared");
    expect(qc.getQueryData(["current-user"])).toBeUndefined();
    expect(qc.getQueryData(["my-blocks"])).toBeUndefined();
  });

  it("gjenmontert observer får ikke A sine data etter bytte til B", () => {
    const qc = new QueryClient();
    const handle = createAuthQueryCacheHandler(qc);
    handle("INITIAL_SESSION", session("A"));
    seed(qc);

    handle("SIGNED_IN", session("B"));
    const observer = new QueryObserver(qc, {
      queryKey: ["my-blocks"],
      queryFn: () => new Promise<never>(() => {}),
    });
    expect(observer.getCurrentResult().data).toBeUndefined();
  });

  it("nullstiller en aktiv observer ved identitetsbytte (tilstandsovergang)", () => {
    const qc = new QueryClient();
    const handle = createAuthQueryCacheHandler(qc);
    handle("INITIAL_SESSION", session("A"));
    seed(qc);
    const observer = new QueryObserver(qc, {
      queryKey: ["my-blocks"],
      queryFn: () => new Promise<never>(() => {}),
      staleTime: 60_000,
    });
    const unsubscribe = observer.subscribe(() => {});
    expect(observer.getCurrentResult().data).toEqual([{ blocked_id: "X" }]);

    handle("SIGNED_IN", session("B"));
    expect(observer.getCurrentResult().data).toBeUndefined();
    unsubscribe();
    qc.clear();
  });

  it("beholder cachen ved token-fornyelse og ny innlogging for samme bruker", () => {
    const qc = new QueryClient();
    const handle = createAuthQueryCacheHandler(qc);
    handle("INITIAL_SESSION", session("A"));
    seed(qc);

    expect(handle("TOKEN_REFRESHED", session("A"))).toBeNull();
    expect(handle("SIGNED_IN", session("A"))).toBe("invalidated");
    expect(qc.getQueryData(["my-blocks"])).toEqual([{ blocked_id: "X" }]);
  });

  it("invaliderer (ikke tømmer) ved innlogging fra anonym", () => {
    const qc = new QueryClient();
    const handle = createAuthQueryCacheHandler(qc);
    handle("INITIAL_SESSION", null);
    qc.setQueryData(["categories"], [{ id: "c1" }]);

    expect(handle("SIGNED_IN", session("A"))).toBe("invalidated");
    expect(qc.getQueryData(["categories"])).toEqual([{ id: "c1" }]);
  });
});
