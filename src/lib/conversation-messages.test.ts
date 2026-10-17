import { createClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import type { Database } from "@/integrations/supabase/types";
import {
  conversationMessagesPage,
  MESSAGE_PAGE_SIZE,
  upsertConversationMessage,
  type ConversationMessagesData,
  lastConversationMessages,
  messagePreview,
} from "./conversation-messages";

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

it("grenseverdi: beholder siste melding for alle 1001 samtaler med korte forespørsler", async () => {
  const ids = Array.from({ length: 1001 }, () => crypto.randomUUID());
  const client = createClient<Database>("https://test.invalid", "test-key", {
    auth: { persistSession: false },
    global: {
      fetch: async (input) => {
        const url = new URL(String(input));
        // Simuler PostgRESTs radgrense og avvis for lange URL-er.
        if (url.href.length > 8000)
          return Response.json({ message: "URI too long" }, { status: 414 });
        const selected = url.searchParams.get("id")!.slice(4, -1).split(",");
        return Response.json(
          selected.slice(0, 1000).map((id) => ({
            id,
            messages: [
              {
                body: `Hei ${id}`,
                sender_id: "buyer",
                created_at: "2026-10-02T12:00:00Z",
                deleted_at: null,
                attachment_path: null,
              },
            ],
          })),
        );
      },
    },
  });
  const messages = await lastConversationMessages(ids, client);
  expect([...messages.keys()]).toEqual(ids);
  expect(messages.get(ids.at(-1)!)?.body).toBe(`Hei ${ids.at(-1)}`);
});

describe("messagePreview", () => {
  it("viser bilde for vedlegg uten tekst og skjuler slettede meldinger", () => {
    expect(messagePreview({ body: "", deleted_at: null, attachment_path: "a/b.jpg" })).toBe(
      "📷 Bilde",
    );
    expect(messagePreview({ body: "hei", deleted_at: "x", attachment_path: null })).toBe(
      "Melding slettet",
    );
    expect(messagePreview({ body: "hei", deleted_at: null, attachment_path: null })).toBe("hei");
  });
});

// RV-20261016-02 / PB-1 + PB-8: siste side først og stabil markør ved like tidsstempler.
describe("conversationMessagesPage", () => {
  const created_at = "2026-10-16T12:00:00.000Z";
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    conversation_id: "conv",
    sender_id: "seller",
    body: `Hei æøå 👋 ${i}`,
    created_at,
    deleted_at: null,
  }));
  it.each([0, 1, 49, 50, 51, 1001])(
    "grenseverdi: henter nyeste side av %i meldinger",
    async (size) => {
      const fetch = vi.fn(async (input: RequestInfo | URL) => {
        const url = new URL(String(input));
        expect(url.searchParams.get("order")).toBe("created_at.desc,id.desc");
        const limit = Number(url.searchParams.get("limit"));
        expect(limit).toBe(MESSAGE_PAGE_SIZE + 1);
        return Response.json(rows.slice(0, size).reverse().slice(0, limit));
      });
      const client = createClient<Database>("https://test.invalid", "test-key", {
        global: { fetch },
        auth: { persistSession: false },
      });
      const page = await conversationMessagesPage("conv", null, client);
      expect(page.messages).toHaveLength(Math.min(size, MESSAGE_PAGE_SIZE));
      expect(page.messages[0]?.id).toBe(rows[size - 1]?.id);
      expect(page.nextCursor?.id).toBe(
        size > MESSAGE_PAGE_SIZE ? rows[size - MESSAGE_PAGE_SIZE].id : undefined,
      );
    },
  );
  it("bevarer sidemarkøren og unngår duplikat når realtime leverer under bakoverpaginering", async () => {
    const client = createClient<Database>("https://test.invalid", "test-key", {
      auth: { persistSession: false },
      global: {
        fetch: async (input) => {
          const url = new URL(String(input));
          const before = url.searchParams.get("or")?.match(/id.lt.([0-9a-f-]+)/)?.[1];
          return Response.json(
            rows
              .filter((m) => !before || m.id < before)
              .slice()
              .reverse()
              .slice(0, Number(url.searchParams.get("limit"))),
          );
        },
      },
    });
    const first = await conversationMessagesPage("conv", null, client);
    const newer = { ...rows[1000], id: "ffffffff-ffff-4fff-8fff-ffffffffffff" };
    let data: ConversationMessagesData = { pages: [first], pageParams: [null] };
    data = upsertConversationMessage(data, newer);
    data = upsertConversationMessage(data, newer);
    const all = [...data.pages[0].messages];
    let cursor = first.nextCursor;
    while (cursor) {
      const page = await conversationMessagesPage("conv", cursor, client);
      all.push(...page.messages);
      cursor = page.nextCursor;
    }
    expect(all).toHaveLength(1002);
    expect(new Set(all.map((m) => m.id)).size).toBe(1002);
    expect(data.pages[0].nextCursor).toEqual(first.nextCursor);
  });
  it("erstatter optimistisk melding én gang når realtime og bekreftelse kommer i begge rekkefølger", () => {
    for (const realtimeFirst of [true, false]) {
      let data = upsertConversationMessage(undefined, {
        ...rows[0],
        id: "optimistic",
        pending: true,
      });
      if (realtimeFirst) data = upsertConversationMessage(data, rows[0]);
      data = upsertConversationMessage(data, rows[0], "optimistic");
      data = upsertConversationMessage(data, rows[0]);
      expect(data.pages[0].messages).toEqual([rows[0]]);
    }
  });
  it("kaster ved sidefeil i stedet for å vise en tom samtale", async () => {
    const client = createClient<Database>("https://test.invalid", "test-key", {
      auth: { persistSession: false },
      global: { fetch: async () => Response.json({ message: "Page failed" }, { status: 400 }) },
    });
    await expect(conversationMessagesPage("conv", rows[500], client)).rejects.toMatchObject({
      message: "Page failed",
    });
  });
});
