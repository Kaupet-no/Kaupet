import { afterEach, describe, expect, it, vi } from "vitest";

const { putObjectMock, deleteObjectMock, presignGetUrlMock, rpcMock, fromMock } = vi.hoisted(
  () => ({
    putObjectMock: vi.fn().mockResolvedValue(undefined),
    deleteObjectMock: vi.fn().mockResolvedValue(undefined),
    presignGetUrlMock: vi.fn(
      async (bucket: string, key: string) => `https://r2.example/${bucket}/${key}?signed=1`,
    ),
    rpcMock: vi.fn(),
    fromMock: vi.fn(),
  }),
);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { storage: { from: () => ({}) } },
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    let validator: (input: unknown) => unknown = (input) => input;
    let handler:
      | ((input: {
          data: unknown;
          context: {
            userId: string;
            supabase: { rpc: typeof rpcMock; from: typeof fromMock };
          };
        }) => unknown)
      | undefined;
    // async: server functions always run behind a network boundary, so any
    // synchronous throw from the validator must surface as a rejected
    // promise here too, matching the real client-rpc fetcher's behavior.
    const fn = async (input: { data?: unknown } = {}) => {
      if (!handler) throw new Error("server handler not configured");
      return handler({
        data: validator(input.data),
        context: { userId: "user-id", supabase: { rpc: rpcMock, from: fromMock } },
      });
    };
    Object.assign(fn, {
      middleware: () => fn,
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
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: vi.fn() }));
vi.mock("@/lib/r2.server", () => ({
  putObject: putObjectMock,
  deleteObject: deleteObjectMock,
  presignGetUrl: presignGetUrlMock,
}));

import {
  deleteListingImage,
  deletePreviousAvatarImage,
  deletePreviousOrganizationLogo,
  signMessageAttachmentUrls,
  uploadAvatarImage,
  uploadListingImage,
  uploadListingImageThumb,
  uploadMessageAttachment,
  uploadOrganizationLogo,
} from "./storage.functions";

/** Bygger et minimalt supabase-query-chain-mock for `.from(...).select(...).eq(...).maybeSingle()`
 * og `.in(...)`, slik conversations-oppslagene i storage.functions.ts bruker det. */
function mockConversationsTable(opts: {
  maybeSingle?: { data: unknown; error: unknown };
  list?: { data: unknown; error: unknown };
}) {
  fromMock.mockImplementation((table: string) => {
    if (table !== "conversations") throw new Error(`uventet tabell: ${table}`);
    const chain = {
      select: () => chain,
      eq: () => chain,
      in: () => Promise.resolve(opts.list ?? { data: [], error: null }),
      maybeSingle: () => Promise.resolve(opts.maybeSingle ?? { data: null, error: null }),
    };
    return chain;
  });
}

const LISTING_ID = "11111111-1111-1111-1111-111111111111";

function makeFile(bytes: number, type = "image/jpeg", name = "bilde.jpg"): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

function formData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

afterEach(() => {
  putObjectMock.mockReset().mockResolvedValue(undefined);
  deleteObjectMock.mockReset().mockResolvedValue(undefined);
  presignGetUrlMock
    .mockReset()
    .mockImplementation(
      async (bucket: string, key: string) => `https://r2.example/${bucket}/${key}?signed=1`,
    );
  rpcMock.mockReset();
  fromMock.mockReset();
  const originalEnv = process.env.R2_PUBLIC_BASE_URL;
  if (originalEnv === undefined) delete process.env.R2_PUBLIC_BASE_URL;
});

describe("uploadListingImage", () => {
  it("avviser en fil som er større enn MAX_FILE_BYTES", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(
      uploadListingImage({
        data: formData({ listingId: LISTING_ID, file: makeFile(6 * 1024 * 1024) }),
      }),
    ).rejects.toThrow("for stor");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser en fil med ikke-støttet MIME-type", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(
      uploadListingImage({
        data: formData({
          listingId: LISTING_ID,
          file: makeFile(1024, "application/pdf", "fil.pdf"),
        }),
      }),
    ).rejects.toThrow("format");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser opplasting når can_upload_listing_image nekter tilgang", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(
      uploadListingImage({ data: formData({ listingId: LISTING_ID, file: makeFile(1024) }) }),
    ).rejects.toThrow("tilgang");
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("can_upload_listing_image", { _listing_id: LISTING_ID });
  });

  it("laster opp med nøkkelen {listingId}/{uuid}.{ext} når tilgangen er gyldig", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const result = await uploadListingImage({
      data: formData({ listingId: LISTING_ID, file: makeFile(1024) }),
    });
    expect(result.path).toMatch(new RegExp(`^${LISTING_ID}/[0-9a-f-]{36}\\.jpg$`));
    expect(putObjectMock).toHaveBeenCalledWith(
      "BILDER",
      result.path,
      expect.anything(),
      "image/jpeg",
    );
  });

  it("avviser en ugyldig annonse-id", async () => {
    await expect(
      uploadListingImage({ data: formData({ listingId: "ikke-en-uuid", file: makeFile(1024) }) }),
    ).rejects.toThrow("Ugyldig annonse-id");
  });
});

describe("uploadListingImageThumb", () => {
  const validPath = `${LISTING_ID}/22222222-2222-2222-2222-222222222222.jpg`;

  it("avviser en sti som ikke matcher nøkkelskjemaet", async () => {
    await expect(
      uploadListingImageThumb({ data: formData({ path: "../etc/passwd", file: makeFile(1024) }) }),
    ).rejects.toThrow("Ugyldig bildesti");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser når brukeren ikke har tilgang til annonsen", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(
      uploadListingImageThumb({ data: formData({ path: validPath, file: makeFile(1024) }) }),
    ).rejects.toThrow("tilgang");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("laster opp thumbnailen ved siden av originalen", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await uploadListingImageThumb({ data: formData({ path: validPath, file: makeFile(1024) }) });
    expect(putObjectMock).toHaveBeenCalledWith(
      "BILDER",
      validPath.replace(".jpg", "-thumb.jpg"),
      expect.anything(),
      "image/jpeg",
    );
  });
});

describe("deleteListingImage", () => {
  const validPath = `${LISTING_ID}/22222222-2222-2222-2222-222222222222.jpg`;

  it("avviser en ugyldig sti", async () => {
    await expect(deleteListingImage({ data: { path: "noe/annet.jpg" } })).rejects.toThrow();
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("avviser sletting uten tilgang til annonsen", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(deleteListingImage({ data: { path: validPath } })).rejects.toThrow("tilgang");
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("sletter både originalen og thumbnailen når tilgangen er gyldig", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await deleteListingImage({ data: { path: validPath } });
    expect(deleteObjectMock).toHaveBeenCalledWith("BILDER", validPath);
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "BILDER",
      validPath.replace(".jpg", "-thumb.jpg"),
    );
  });
});

describe("uploadAvatarImage", () => {
  it("avviser en for stor avatar-fil", async () => {
    await expect(
      uploadAvatarImage({ data: formData({ file: makeFile(6 * 1024 * 1024) }) }),
    ).rejects.toThrow("for stor");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("bygger nøkkelen fra den innloggede brukerens id, ikke klientinput", async () => {
    const result = await uploadAvatarImage({ data: formData({ file: makeFile(1024) }) });
    expect(putObjectMock).toHaveBeenCalledWith(
      "BILDER",
      expect.stringMatching(/^user-id\/avatar-[0-9a-f-]{36}\.jpg$/),
      expect.anything(),
      "image/jpeg",
    );
    expect(result.url).toContain("user-id/avatar-");
  });
});

describe("uploadOrganizationLogo", () => {
  const ORG_ID = "33333333-3333-3333-3333-333333333333";

  it("avviser når brukeren ikke er organisasjonens superbruker", async () => {
    rpcMock.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn !== "is_organization_superuser", error: null }),
    );
    await expect(
      uploadOrganizationLogo({
        data: formData({ organizationId: ORG_ID, file: makeFile(1024) }),
      }),
    ).rejects.toThrow("tilgang");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser når organisasjonen mangler Proff-tilgang", async () => {
    rpcMock.mockImplementation((fn: string) =>
      Promise.resolve({ data: fn === "is_organization_superuser", error: null }),
    );
    await expect(
      uploadOrganizationLogo({
        data: formData({ organizationId: ORG_ID, file: makeFile(1024) }),
      }),
    ).rejects.toThrow("tilgang");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("laster opp logoen når begge sjekkene er oppfylt", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const result = await uploadOrganizationLogo({
      data: formData({ organizationId: ORG_ID, file: makeFile(1024) }),
    });
    expect(result.path).toMatch(new RegExp(`^${ORG_ID}/logo-[0-9a-f-]{36}\\.jpg$`));
  });
});

describe("deletePreviousAvatarImage", () => {
  it("nekter å slette en annen brukers avatar", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://bilder.kaupet.no";
    await deletePreviousAvatarImage({
      data: { previousPublicUrl: "https://bilder.kaupet.no/en-annen-bruker/avatar-x.jpg" },
    });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("sletter den forrige avataren til samme bruker", async () => {
    process.env.R2_PUBLIC_BASE_URL = "https://bilder.kaupet.no";
    await deletePreviousAvatarImage({
      data: { previousPublicUrl: "https://bilder.kaupet.no/user-id/avatar-x.jpg" },
    });
    expect(deleteObjectMock).toHaveBeenCalledWith("BILDER", "user-id/avatar-x.jpg");
  });
});

describe("deletePreviousOrganizationLogo", () => {
  it("nekter å slette uten organisasjonstilgang", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await deletePreviousOrganizationLogo({ data: { previousPath: "org-id/logo-x.jpg" } });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("sletter den forrige logoen når tilgangen er gyldig", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await deletePreviousOrganizationLogo({ data: { previousPath: "org-id/logo-x.jpg" } });
    expect(deleteObjectMock).toHaveBeenCalledWith("BILDER", "org-id/logo-x.jpg");
  });
});

describe("uploadMessageAttachment", () => {
  const CONVERSATION_ID = "44444444-4444-4444-4444-444444444444";

  it("avviser en ugyldig samtale-id", async () => {
    await expect(
      uploadMessageAttachment({
        data: formData({ conversationId: "ikke-en-uuid", file: makeFile(1024) }),
      }),
    ).rejects.toThrow("Ugyldig samtale-id");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser en for stor eller feil-typet fil", async () => {
    await expect(
      uploadMessageAttachment({
        data: formData({ conversationId: CONVERSATION_ID, file: makeFile(6 * 1024 * 1024) }),
      }),
    ).rejects.toThrow("for stor");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser en bruker som ikke er deltaker i samtalen (sikkerhetsgrense)", async () => {
    mockConversationsTable({
      maybeSingle: {
        data: { id: CONVERSATION_ID, buyer_id: "noen-andre", seller_id: "en-tredje" },
        error: null,
      },
    });
    await expect(
      uploadMessageAttachment({
        data: formData({ conversationId: CONVERSATION_ID, file: makeFile(1024) }),
      }),
    ).rejects.toThrow("Du er ikke deltaker");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser når samtalen ikke finnes", async () => {
    mockConversationsTable({ maybeSingle: { data: null, error: null } });
    await expect(
      uploadMessageAttachment({
        data: formData({ conversationId: CONVERSATION_ID, file: makeFile(1024) }),
      }),
    ).rejects.toThrow("Du er ikke deltaker");
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("laster opp til VEDLEGG med nøkkelen {conversationId}/{uuid}.{ext} for en deltaker", async () => {
    mockConversationsTable({
      maybeSingle: {
        data: { id: CONVERSATION_ID, buyer_id: "user-id", seller_id: "noen-andre" },
        error: null,
      },
    });
    const result = await uploadMessageAttachment({
      data: formData({ conversationId: CONVERSATION_ID, file: makeFile(1024) }),
    });
    expect(result.path).toMatch(new RegExp(`^${CONVERSATION_ID}/[0-9a-f-]{36}\\.jpg$`));
    expect(putObjectMock).toHaveBeenCalledWith(
      "VEDLEGG",
      result.path,
      expect.anything(),
      "image/jpeg",
    );
  });
});

describe("signMessageAttachmentUrls", () => {
  const CONVERSATION_ID = "44444444-4444-4444-4444-444444444444";
  const OTHER_CONVERSATION_ID = "55555555-5555-5555-5555-555555555555";
  const path = `${CONVERSATION_ID}/22222222-2222-2222-2222-222222222222.jpg`;
  const otherPath = `${OTHER_CONVERSATION_ID}/33333333-3333-3333-3333-333333333333.jpg`;

  it("utelater vedlegg fra en samtale brukeren ikke er deltaker i (sikkerhetsgrense)", async () => {
    mockConversationsTable({
      list: {
        data: [
          { id: CONVERSATION_ID, buyer_id: "user-id", seller_id: "noen-andre" },
          { id: OTHER_CONVERSATION_ID, buyer_id: "noen-andre", seller_id: "en-tredje" },
        ],
        error: null,
      },
    });
    const result = await signMessageAttachmentUrls({ data: { paths: [path, otherPath] } });
    expect(Object.keys(result)).toEqual([path]);
    expect(presignGetUrlMock).toHaveBeenCalledTimes(1);
    expect(presignGetUrlMock).toHaveBeenCalledWith("VEDLEGG", path, 60 * 60);
  });

  it("returnerer ingenting og gjør ingen oppslag for en tom liste", async () => {
    const result = await signMessageAttachmentUrls({ data: { paths: [] } });
    expect(result).toEqual({});
    expect(fromMock).not.toHaveBeenCalled();
    expect(presignGetUrlMock).not.toHaveBeenCalled();
  });

  it("avviser en sti som ikke matcher nøkkelskjemaet", async () => {
    await expect(
      signMessageAttachmentUrls({ data: { paths: ["../etc/passwd"] } }),
    ).rejects.toThrow();
    expect(presignGetUrlMock).not.toHaveBeenCalled();
  });

  it("avviser mer enn 100 stier i én forespørsel", async () => {
    const paths = Array.from(
      { length: 101 },
      () => `${CONVERSATION_ID}/${crypto.randomUUID()}.jpg`,
    );
    await expect(signMessageAttachmentUrls({ data: { paths } })).rejects.toThrow(
      "For mange vedlegg",
    );
    expect(presignGetUrlMock).not.toHaveBeenCalled();
  });
});
