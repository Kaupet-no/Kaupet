// @vitest-environment jsdom
//
// "-"-prefiks med vilje, se src/routes/-index.test.tsx: TanStack Start
// scanner alt under src/routes/ som rutefiler uten prefikset. Vitest sitt
// glob (src/**/*.test.tsx) treffer fila fortsatt.

import type { ComponentType, ReactNode } from "react";
import { act, cleanup, render } from "@testing-library/react";
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
    return { data: undefined, isLoading: false, isError: false, error: null };
  },
  useMutation: () => ({ mutate: vi.fn(), isPending: false }),
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
    setQueryData: vi.fn(),
    getQueryData: vi.fn(),
  }),
}));

vi.mock("@tanstack/react-start", () => ({ useServerFn: (fn: unknown) => fn }));

vi.mock("@/integrations/supabase/client", () => {
  const channel = {
    on: () => channel,
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
vi.mock("@/components/meldinger/sale-panel", () => ({ SalePanel: () => null }));
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
