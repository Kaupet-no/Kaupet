// @vitest-environment jsdom
//
// "-"-prefiks med vilje, se src/routes/-index.test.tsx: TanStack Start
// scanner alt under src/routes/ som rutefiler uten prefikset. Vitest sitt
// glob (src/**/*.test.tsx) treffer fila fortsatt.

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Regresjonstest for F16: realtime-kanalen for den åpne samtalen svarte 500 i
// staging uten at ["messages", id] (eller lesekvitteringene på
// ["conversation", id]) fikk noen fallback. Testen dekker kjernekontrakten:
// en mislykket kanalstatus skal slå på polling på begge spørringene, en
// vellykket skal la den stå av.

const mocks = vi.hoisted(() => ({
  statusCallback: null as ((status: string) => void) | null,
  statusCallbacks: [] as ((status: string) => void)[],
  queryCalls: [] as { key: unknown[]; opts: Record<string, unknown> }[],
  routeId: "conv-1",
  // Overstyrer default-svaret (undefined-data) for en gitt queryKey-prefiks —
  // brukes av blokkerings-testene under til å sette opp conv/myBlocks/
  // blocksAgainstMe uten å måtte kjøre de ekte queryFn-ene mot Supabase.
  queryData: {} as Record<string, unknown>,
  handlers: [] as { event: string; table: string; cb: (payload: { new: unknown }) => void }[],
  setQueryData: vi.fn(),
  setQueriesData: vi.fn(),
  mutate: vi.fn(),
  fetchNextPage: vi.fn().mockResolvedValue({}),
  infiniteState: {} as Record<string, unknown>,
}));

vi.mock("@tanstack/react-router", () => ({
  createFileRoute: () => (options: unknown) => ({
    useParams: () => ({ id: mocks.routeId }),
    useSearch: () => ({}),
    options,
  }),
  Link: ({ children, ...props }: { children?: ReactNode }) => <a {...props}>{children}</a>,
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (opts: { queryKey: unknown[] } & Record<string, unknown>) => {
    mocks.queryCalls.push({ key: opts.queryKey, opts });
    if (opts.queryKey[0] === "messages") return { data: [], isLoading: false };
    const prefix = opts.queryKey[0] as string;
    if (prefix in mocks.queryData) {
      return { data: mocks.queryData[prefix], isLoading: false, isError: false, error: null };
    }
    return { data: undefined, isLoading: false, isError: false, error: null };
  },
  useInfiniteQuery: (opts: { queryKey: unknown[] } & Record<string, unknown>) => {
    mocks.queryCalls.push({ key: opts.queryKey, opts });
    return {
      data: mocks.queryData.messages ?? {
        pages: [{ messages: [], nextCursor: undefined }],
        pageParams: [null],
      },
      isLoading: false,
      hasNextPage: false,
      fetchNextPage: mocks.fetchNextPage,
      ...mocks.infiniteState,
    };
  },
  useMutation: () => ({ mutate: mocks.mutate, isPending: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: mocks.setQueryData,
    setQueriesData: mocks.setQueriesData,
    getQueryData: () => mocks.queryData.messages,
    cancelQueries: vi.fn().mockResolvedValue(undefined),
  }),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: (
      _type: string,
      filter: { event: string; table: string },
      cb: (payload: { new: unknown }) => void,
    ) => {
      mocks.handlers.push({ event: filter.event, table: filter.table, cb });
      return channel;
    },
    subscribe: (cb: (status: string) => void) => {
      mocks.statusCallback = cb;
      mocks.statusCallbacks.push(cb);
      return channel;
    },
  };
  return { supabase: { channel: () => channel, removeChannel: vi.fn() } };
});

vi.mock("@/hooks/use-auth", () => ({ useAuth: () => ({ user: { id: "user-1" } }) }));
vi.mock("@/hooks/use-is-native", () => ({ useIsNative: () => false }));
vi.mock("@/hooks/use-form-factor", () => ({ useFormFactor: () => "phone" }));
vi.mock("@/hooks/use-keyboard-visible", () => ({ useKeyboardVisible: () => false }));
vi.mock("@/features/business-account/use-business-membership", () => ({
  useBusinessMembership: () => ({ data: undefined }),
}));
vi.mock("@/lib/toast", () => ({ showSuccessToast: vi.fn(), showErrorToast: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  IMAGE_ACCEPT: "image/*",
  signListingImageUrls: vi.fn(),
  signMessageAttachmentUrls: vi.fn().mockResolvedValue({}),
  uploadMessageAttachment: vi.fn(),
  validateImages: vi.fn(),
  describeImageError: vi.fn(),
}));
vi.mock("@/lib/messages.functions", () => ({ sendMessage: vi.fn() }));
vi.mock("@/lib/image-compression", () => ({ compressImage: vi.fn() }));
vi.mock("@/lib/blocks.functions", () => ({
  listMyBlocks: vi.fn(),
  listBlocksAgainstMe: vi.fn(),
}));
vi.mock("@/lib/sales.functions", () => ({
  confirmBuyer: vi.fn(),
  getSaleForListing: vi.fn(),
  unconfirmBuyer: vi.fn(),
}));
vi.mock("@/lib/reviews.functions", () => ({
  createReview: vi.fn(),
  getMyReviewForListing: vi.fn(),
}));
vi.mock("@/components/block-conversation-menu", () => ({ BlockConversationMenu: () => null }));
vi.mock("@/components/inbox-page", () => ({ InboxPage: () => null }));
vi.mock("@/components/native-page-header", () => ({ NativePageHeader: () => null }));
vi.mock("@/components/meldinger/message-list", () => ({
  renderWithDayDividers: () => null,
}));
vi.mock("@/components/meldinger/sale-panel", () => ({ SalePanel: () => <p>Salgspanel</p> }));
vi.mock("@/components/trade-safety-advice", () => ({ TradeSafetyAdvice: () => null }));

import { Route, MESSAGES_POLL_INTERVAL_MS } from "./meldinger.$id";

const ConversationPage = Route.options.component as ComponentType;

function lastQueryOptsFor(keyPrefix: string) {
  const calls = mocks.queryCalls.filter((c) => c.key[0] === keyPrefix);
  return calls[calls.length - 1]?.opts;
}

beforeEach(() => {
  mocks.statusCallback = null;
  mocks.statusCallbacks = [];
  mocks.queryCalls = [];
  mocks.routeId = "conv-1";
  mocks.queryData = {};
  mocks.handlers = [];
  mocks.setQueryData.mockReset();
  mocks.setQueriesData.mockReset();
  mocks.mutate.mockReset();
  mocks.infiniteState = {};
  mocks.fetchNextPage.mockClear();
});

afterEach(() => {
  cleanup();
});

describe("meldinger.$id — realtime-fallback (F16)", () => {
  it("slår ikke på polling mens kanalen er SUBSCRIBED", () => {
    render(<ConversationPage />);

    act(() => {
      mocks.statusCallback?.("SUBSCRIBED");
    });

    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
  });

  it("slår på polling på både meldinger og lesekvitteringer når kanalen ikke er SUBSCRIBED", () => {
    render(<ConversationPage />);

    act(() => {
      mocks.statusCallback?.("CHANNEL_ERROR");
    });

    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);
  });

  it("slår polling av igjen når kanalen kommer opp etter en feil", () => {
    render(<ConversationPage />);

    act(() => {
      mocks.statusCallback?.("TIMED_OUT");
    });
    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(MESSAGES_POLL_INTERVAL_MS);

    act(() => {
      mocks.statusCallback?.("SUBSCRIBED");
    });
    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);
  });

  it("ignorerer CLOSED fra en utgått kanal etter samtalebytte", () => {
    const { rerender } = render(<ConversationPage />);
    const channel1Status = mocks.statusCallbacks[0];

    act(() => {
      channel1Status("SUBSCRIBED");
    });

    mocks.routeId = "conv-2";
    rerender(<ConversationPage />);
    const channel2Status = mocks.statusCallbacks[1];

    act(() => {
      channel2Status("SUBSCRIBED");
    });

    // Kanal 1 sin CLOSED kommer inn asynkront, etter at kanal 2 allerede
    // er SUBSCRIBED — den skal ikke slå på polling igjen.
    act(() => {
      channel1Status("CLOSED");
    });

    expect(lastQueryOptsFor("messages")?.refetchInterval).toBe(false);
    expect(lastQueryOptsFor("conversation")?.refetchInterval).toBe(false);
  });
});

// RV-20261016-02 / PB-2: eksplisitt bakoverpaginering, med feiltilstand.
it("lar brukeren hente eldre meldinger", async () => {
  mocks.infiniteState = { hasNextPage: true };
  mocks.queryData.conversation = baseConv();
  const view = render(<ConversationPage />);
  await act(async () => fireEvent.click(view.getByRole("button", { name: "Vis eldre meldinger" })));
  expect(mocks.fetchNextPage).toHaveBeenCalledOnce();
});
it("viser feil ved henting av eldre meldinger og beholder nytt forsøk", () => {
  mocks.infiniteState = { hasNextPage: true, isFetchNextPageError: true };
  mocks.queryData.conversation = baseConv();
  const view = render(<ConversationPage />);
  expect(view.getByRole("alert").textContent).toContain("Kunne ikke hente eldre meldinger");
  expect(view.getByRole("button", { name: "Vis eldre meldinger" })).toBeTruthy();
});

it("beholder leseposisjonen når eldre sider eller lesekvitteringer lastes", () => {
  const raf = vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 0;
  });
  try {
    const newest = { id: "m2", created_at: "2026-10-16T12:00:00Z" };
    mocks.queryData = {
      conversation: baseConv(),
      messages: { pages: [{ messages: [newest], nextCursor: newest }], pageParams: [null] },
    };
    const view = render(<ConversationPage />);
    const log = view.getByRole("log");
    Object.defineProperty(log, "scrollHeight", { value: 1000, configurable: true });
    log.scrollTop = 30;
    mocks.queryData.conversation = baseConv({ seller_last_read_at: newest.created_at });
    mocks.queryData.messages = {
      pages: [
        { messages: [newest], nextCursor: newest },
        { messages: [{ id: "m1", created_at: "2026-10-15T12:00:00Z" }], nextCursor: undefined },
      ],
      pageParams: [null, newest],
    };
    view.rerender(<ConversationPage />);
    expect(log.scrollTop).toBe(30);
  } finally {
    raf.mockRestore();
  }
});

// Blokkerings-UI (App Store 1.2): komponenten skal vise en tydelig tilstand
// og deaktivere komposeren når innlogget bruker har blokkert motparten, eller
// er blokkert av den. useAuth er mocket til user-1, som er buyer_id i
// conv-fixturen under — otherId blir da seller-1.
function baseConv(overrides: Record<string, unknown> = {}) {
  return {
    id: "conv-1",
    buyer_id: "user-1",
    seller_id: "seller-1",
    listing_id: null,
    listing: null,
    isBusinessSeller: false,
    other: { id: "seller-1", display_name: "Selger", avatar_url: null },
    otherOrganizationName: null,
    otherDeleted: false,
    otherPending: false,
    buyer_last_read_at: null,
    seller_last_read_at: null,
    ...overrides,
  };
}

describe("meldinger.$id — blokkeringstilstand", () => {
  it("deaktiverer komposeren og viser blokkeringsbeskjed når jeg har blokkert motparten", () => {
    mocks.queryData = {
      conversation: baseConv(),
      "my-blocks": [{ scope: "all", blocked_id: "seller-1", conversation_id: null }],
      "blocks-against-me": [],
    };

    const { container } = render(<ConversationPage />);

    expect(container.textContent).toContain("Du har blokkert");
    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(true);
    expect(textarea?.getAttribute("placeholder")).toBe("Du har blokkert denne samtalen");
  });

  it("deaktiverer komposeren med en nøytral beskjed når motparten har blokkert meg", () => {
    mocks.queryData = {
      conversation: baseConv(),
      "my-blocks": [],
      "blocks-against-me": [{ blocker_id: "seller-1", scope: "all", conversation_id: null }],
    };

    const { container } = render(<ConversationPage />);

    expect(container.textContent).toContain("Du kan ikke sende meldinger i denne samtalen");
    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(true);
  });

  it("lar komposeren stå aktiv når ingen av partene har blokkert hverandre", () => {
    mocks.queryData = {
      conversation: baseConv(),
      "my-blocks": [],
      "blocks-against-me": [],
    };

    const { container } = render(<ConversationPage />);

    const textarea = container.querySelector("textarea");
    expect(textarea?.disabled).toBe(false);
  });
});

describe("meldinger.$id — kjøpsønsker, realtime og komposer (KG-24)", () => {
  const handler = (table: string, event: string) =>
    mocks.handlers.find((h) => h.table === table && h.event === event)?.cb;

  // KG-24-F01
  it("viser kjøpsønsket og skjuler salgspanelet i en samtale om et kjøpsønske", () => {
    mocks.queryData = {
      conversation: baseConv({
        wtb_listing_id: "wtb-1",
        wtbListing: { id: "wtb-1", title: "Ønsker sykkel", max_price_nok: null },
      }),
      "my-blocks": [],
      "blocks-against-me": [],
    };
    const { container } = render(<ConversationPage />);
    expect(container.textContent).toContain("Ønsker sykkel");
    expect(container.textContent).not.toContain("Annonsen er ikke lenger tilgjengelig");
    expect(container.textContent).not.toContain("Salgspanel");
  });

  // KG-24-F02
  it("oppdaterer lesekvitteringen i den aktive samtalespørringen", () => {
    render(<ConversationPage />);
    act(() => handler("conversations", "UPDATE")?.({ new: { buyer_last_read_at: "t" } }));
    expect(mocks.setQueriesData).toHaveBeenCalledWith(
      { queryKey: ["conversation", "conv-1"] },
      expect.any(Function),
    );
  });

  // KG-24-F03
  it("skjuler en melding motparten sletter mens samtalen er åpen", () => {
    render(<ConversationPage />);
    const deleted = { id: "m1", body: "", deleted_at: "2026-10-13T10:00:00Z" };
    act(() => handler("messages", "UPDATE")?.({ new: deleted }));
    const call = mocks.setQueryData.mock.calls.find(([key]) => key[0] === "messages");
    expect(call?.[0]).toEqual(["messages", "conv-1"]);
    const data = {
      pages: [{ messages: [{ id: "m1", body: "hei", deleted_at: null }], nextCursor: undefined }],
      pageParams: [null],
    };
    expect(call?.[1](data).pages[0].messages).toEqual([
      { id: "m1", body: "", deleted_at: "2026-10-13T10:00:00Z" },
    ]);
  });

  // KG-24-F04
  it("tar ikke med uferdig tekst til neste samtale", () => {
    mocks.queryData = { conversation: baseConv(), "my-blocks": [], "blocks-against-me": [] };
    const { container, rerender } = render(<ConversationPage />);
    const textarea = container.querySelector("textarea")!;
    fireEvent.change(textarea, { target: { value: "Til samtale A" } });
    mocks.routeId = "conv-2";
    rerender(<ConversationPage />);
    expect(container.querySelector("textarea")!.value).toBe("");
  });
});

it("lar bedriftssuperbrukeren sende et bilde i en ansatts samtale", () => {
  mocks.queryData = {
    conversation: baseConv({
      buyer_id: "buyer-1",
      seller_id: "employee-1",
      isBusinessSeller: true,
      listing_id: "listing-1",
      listing: { id: "listing-1", title: "Bedriftens annonse", listing_images: [] },
    }),
    "my-blocks": [],
    "blocks-against-me": [],
  };
  vi.stubGlobal(
    "URL",
    class extends URL {
      static createObjectURL = vi.fn(() => "blob:attachment");
      static revokeObjectURL = vi.fn();
    },
  );
  try {
    const { container, getByRole } = render(<ConversationPage />);
    expect(getByRole("button", { name: "Legg ved bilde" })).toBeDefined();
    const file = new File(["image"], "bilde.jpg", { type: "image/jpeg" });
    fireEvent.change(container.querySelector('input[type="file"]')!, {
      target: { files: [file] },
    });
    const send = getByRole("button", { name: "Send" });
    expect(send.hasAttribute("disabled")).toBe(false);
    fireEvent.click(send);
    expect(mocks.mutate).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: "conv-1", file }),
    );
    expect(container.textContent).not.toContain("Salgspanel");
  } finally {
    vi.unstubAllGlobals();
  }
});
