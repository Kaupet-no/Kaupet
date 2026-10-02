import { createClient } from "@supabase/supabase-js";
import { expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import { lastConversationMessages } from "./conversation-messages";

it("henter én siste melding per samtale og beholder tomme samtaler uten melding", async () => {
  const message = {
    body: "Hei æøå 👋",
    sender_id: "buyer",
    created_at: "2026-10-02T12:00:00Z",
    deleted_at: null,
    attachment_path: null,
  };
  const fetch = vi.fn(async (_input: RequestInfo | URL) => {
    return Response.json([
      { id: "long", messages: [message] },
      { id: "older", messages: [message] },
      { id: "empty", messages: [] },
    ]);
  });
  const client = createClient<Database>("https://test.invalid", "test-key", {
    global: { fetch },
    auth: { persistSession: false },
  });
  const messages = await lastConversationMessages(["long", "older", "empty"], client);
  const url = new URL(String(fetch.mock.calls[0][0]));
  expect(url.pathname).toBe("/rest/v1/conversations");
  expect(url.searchParams.get("messages.limit")).toBe("1");
  expect(url.searchParams.get("messages.order")).toBe("created_at.desc,id.desc");
  expect(url.searchParams.get("id")).toBe("in.(long,older,empty)");
  expect([...messages.keys()]).toEqual(["long", "older"]);
  expect(messages.get("older")).toEqual(message);
});

it("feilgjetting: nettverksfeil blir ikke tolket som tomme samtaler", async () => {
  const client = createClient<Database>("https://test.invalid", "test-key", {
    global: {
      fetch: async () => Response.json({ message: "Database unavailable" }, { status: 400 }),
    },
    auth: { persistSession: false },
  });
  await expect(lastConversationMessages(["long"], client)).rejects.toMatchObject({
    message: "Database unavailable",
  });
});

it("nedre grense: en tom samtaleliste trenger ingen spørring", async () => {
  expect(await lastConversationMessages([])).toEqual(new Map());
});
