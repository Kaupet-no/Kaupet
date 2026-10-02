import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  putObjectMock,
  deleteObjectMock,
  presignGetUrlMock,
  rpcMock,
  fromMock,
  adminRpcMock,
  rateLimitMock,
  transformMock,
  eventLog,
} = vi.hoisted(() => ({
  putObjectMock: vi.fn().mockResolvedValue(undefined),
  deleteObjectMock: vi.fn().mockResolvedValue(undefined),
  presignGetUrlMock: vi.fn(
    async (bucket: string, key: string) => `https://r2.example/${bucket}/${key}?signed=1`,
  ),
  rpcMock: vi.fn(),
  fromMock: vi.fn(),
  adminRpcMock: vi.fn(),
  rateLimitMock: vi.fn(),
  transformMock: vi.fn(),
  eventLog: [] as string[],
}));
const USER_ID = "22222222-2222-2222-2222-222222222222";

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
        context: { userId: USER_ID, supabase: { rpc: rpcMock, from: fromMock } },
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
vi.mock("@/integrations/supabase/client.server", () => ({
  supabaseAdmin: { rpc: adminRpcMock },
}));
vi.mock("@/lib/rate-limit.server", () => ({ assertUserNotRateLimited: rateLimitMock }));
vi.mock("@/lib/image-compression.server", () => ({
  CloudflareImagesTransformer: class {
    transform() {
      return transformMock();
    }
  },
}));
vi.mock("@/lib/to-client-error", () => ({
  ClientError: class ClientError extends Error {
    constructor(
      message: string,
      readonly status = 400,
    ) {
      super(message);
    }
  },
}));
vi.mock("@/lib/r2.server", () => ({
  putObject: (...args: unknown[]) => {
    eventLog.push("put");
    return putObjectMock(...args);
  },
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
  const content = new Uint8Array(bytes);
  const signatures: Record<string, number[]> = {
    "image/jpeg": [0xff, 0xd8, 0xff],
    "image/png": [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
    "image/webp": [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
    "image/jxl": [0xff, 0x0a],
  };
  content.set((signatures[type] ?? []).slice(0, bytes));
  return new File([content], name, { type });
}

function formData(fields: Record<string, string | File>): FormData {
  const fd = new FormData();
  for (const [key, value] of Object.entries(fields)) fd.append(key, value);
  return fd;
}

beforeEach(() => {
  transformMock.mockReset().mockImplementation(() => {
    throw new Error("Cloudflare Images må ikke brukes for standardopplastinger");
  });
});

afterEach(() => {
  expect(transformMock).not.toHaveBeenCalled();
  putObjectMock.mockReset().mockResolvedValue(undefined);
  deleteObjectMock.mockReset().mockResolvedValue(undefined);
  presignGetUrlMock
    .mockReset()
    .mockImplementation(
      async (bucket: string, key: string) => `https://r2.example/${bucket}/${key}?signed=1`,
    );
  rpcMock.mockReset();
  fromMock.mockReset();
  adminRpcMock.mockReset().mockImplementation((name: string) => {
    eventLog.push(name);
    return Promise.resolve({ data: true, error: null });
  });
  rateLimitMock.mockReset().mockImplementation((_userId: string, bucket: string) => {
    eventLog.push(bucket);
    return Promise.resolve(undefined);
  });
  eventLog.length = 0;
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

  it.each([
    new File(["<html>nope</html>"], "spoof.jpg", { type: "image/jpeg" }),
    new File([new Uint8Array(12)], "fake.jpg", { type: "image/jpeg" }),
  ])("avviser innhold som bare later som det er et bilde", async (file) => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(
      uploadListingImage({ data: formData({ listingId: LISTING_ID, file }) }),
    ).rejects.toMatchObject({ status: 400 });
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("avviser en JPEG XL-beholder med feil 12-byte-signatur", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const file = new File(
      [new Uint8Array([0, 0, 0, 12, 0x4a, 0x58, 0x4c, 0x20, 0x0d, 0x0a, 0, 0])],
      "feil.jxl",
      { type: "image/jxl" },
    );
    await expect(
      uploadListingImage({ data: formData({ listingId: LISTING_ID, file }) }),
    ).rejects.toMatchObject({ status: 400 });
    expect(adminRpcMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser opplasting når can_upload_listing_image nekter tilgang", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await expect(
      uploadListingImage({ data: formData({ listingId: LISTING_ID, file: makeFile(1024) }) }),
    ).rejects.toThrow("tilgang");
    expect(putObjectMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledWith("can_upload_listing_image", { _listing_id: LISTING_ID });
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("avviser før R2 når den atomiske kvotereservasjonen nekter", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    adminRpcMock.mockResolvedValue({ data: false, error: null });
    await expect(
      uploadListingImage({ data: formData({ listingId: LISTING_ID, file: makeFile(1024) }) }),
    ).rejects.toMatchObject({
      message: expect.stringContaining("grensen for opplastinger"),
      status: 429,
    });
    expect(adminRpcMock).toHaveBeenCalledWith("reserve_standard_upload_quota", {
      _user_id: USER_ID,
      _bytes: 1024,
    });
    expect(putObjectMock).not.toHaveBeenCalled();
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
    expect(eventLog.indexOf("standard_upload")).toBeLessThan(
      eventLog.indexOf("reserve_standard_upload_quota"),
    );
    expect(eventLog.indexOf("register_standard_upload_object")).toBeLessThan(
      eventLog.indexOf("put"),
    );
    expect(adminRpcMock).toHaveBeenNthCalledWith(2, "register_standard_upload_object", {
      _bucket: "BILDER",
      _key: result.path,
    });
  });

  it("reserverer de faktiske opplastingsbytene", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const file = makeFile(1024);
    await uploadListingImage({ data: formData({ listingId: LISTING_ID, file }) });
    expect(adminRpcMock).toHaveBeenCalledWith("reserve_standard_upload_quota", {
      _user_id: USER_ID,
      _bytes: file.size,
    });
  });

  it.each([
    ["image/jpeg", "jpg"],
    ["image/png", "png"],
    ["image/webp", "webp"],
    ["image/jxl", "jxl"],
  ])("lagrer %s direkte med riktig MIME-type og filendelse", async (mime, extension) => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const file = makeFile(128, mime);
    const result = await uploadListingImage({
      data: formData({ listingId: LISTING_ID, file }),
    });
    expect(result.path).toMatch(new RegExp(`\\.${extension}$`));
    expect(putObjectMock).toHaveBeenCalledWith(
      "BILDER",
      result.path,
      new Uint8Array(await file.arrayBuffer()),
      mime,
    );
    expect(transformMock).not.toHaveBeenCalled();
  });

  it("feiler lukket før R2 når objektregistreringen feiler", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    adminRpcMock
      .mockResolvedValueOnce({ data: true, error: null })
      .mockResolvedValueOnce({ data: null, error: new Error("database nede") });
    await expect(
      uploadListingImage({ data: formData({ listingId: LISTING_ID, file: makeFile(1024) }) }),
    ).rejects.toThrow("Kunne ikke registrere R2-opplasting");
    expect(adminRpcMock).toHaveBeenNthCalledWith(1, "reserve_standard_upload_quota", {
      _user_id: USER_ID,
      _bytes: 1024,
    });
    expect(putObjectMock).not.toHaveBeenCalled();
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
    expect(adminRpcMock).toHaveBeenNthCalledWith(2, "register_standard_upload_object", {
      _bucket: "BILDER",
      _key: validPath.replace(".jpg", "-thumb.jpg"),
    });
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
      expect.stringMatching(new RegExp(`^${USER_ID}/avatar-[0-9a-f-]{36}\\.jpg$`)),
      expect.anything(),
      "image/jpeg",
    );
    expect(result.url).toContain(`${USER_ID}/avatar-`);
    expect(putObjectMock).toHaveBeenCalledWith(
      "BILDER",
      expect.stringMatching(/\.jpg$/),
      expect.any(Uint8Array),
      "image/jpeg",
    );
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
    expect(adminRpcMock).not.toHaveBeenCalled();
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
  beforeEach(() => {
    // VITE-varianten må settes fordi koden foretrekker den — ellers slår
    // utviklerens `.env` (hvis den finnes) gjennom og gjør testen ustabil.
    vi.stubEnv("VITE_R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
    vi.stubEnv("R2_PUBLIC_BASE_URL", "https://bilder.kaupet.no");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("nekter å slette en annen brukers avatar", async () => {
    await deletePreviousAvatarImage({
      data: {
        previousPublicUrl:
          "https://bilder.kaupet.no/11111111-1111-1111-1111-111111111111/avatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg",
      },
    });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("sletter den forrige avataren til samme bruker", async () => {
    await deletePreviousAvatarImage({
      data: {
        previousPublicUrl: `https://bilder.kaupet.no/${USER_ID}/avatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`,
      },
    });
    expect(deleteObjectMock).toHaveBeenCalledWith(
      "BILDER",
      `${USER_ID}/avatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`,
    );
  });

  it.each([
    `https://bilder.kaupet.no/${USER_ID}/../other-user/avatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`,
    `https://bilder.kaupet.no/${USER_ID}%2favatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg`,
    `https://bilder.kaupet.no/${USER_ID}/avatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg?x=1`,
    `https://bilder.kaupet.no/${USER_ID}/avatar-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg#x`,
  ])("ignorerer ikke-kanonisk avatar-URL %s", async (previousPublicUrl) => {
    await deletePreviousAvatarImage({ data: { previousPublicUrl } });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });
});

describe("deletePreviousOrganizationLogo", () => {
  it("nekter å slette uten organisasjonstilgang", async () => {
    rpcMock.mockResolvedValue({ data: false, error: null });
    await deletePreviousOrganizationLogo({
      data: {
        previousPath:
          "33333333-3333-3333-3333-333333333333/logo-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg",
      },
    });
    expect(deleteObjectMock).not.toHaveBeenCalled();
  });

  it("sletter den forrige logoen når tilgangen er gyldig", async () => {
    rpcMock.mockResolvedValue({ data: true, error: null });
    const path =
      "33333333-3333-3333-3333-333333333333/logo-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg";
    await deletePreviousOrganizationLogo({ data: { previousPath: path } });
    expect(deleteObjectMock).toHaveBeenCalledWith("BILDER", path);
  });

  it.each([
    "33333333-3333-3333-3333-333333333333/../other-org/logo-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg",
    "33333333-3333-3333-3333-333333333333/logo-%2e%2e.jpg",
    "33333333-3333-3333-3333-333333333333/contact-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa.jpg?x=1",
  ])("ignorerer ikke-kanonisk organisasjonsbildesti %s", async (previousPath) => {
    await deletePreviousOrganizationLogo({ data: { previousPath } });
    expect(rpcMock).not.toHaveBeenCalled();
    expect(deleteObjectMock).not.toHaveBeenCalled();
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
    expect(adminRpcMock).not.toHaveBeenCalled();
  });

  it("avviser vedlegg mellom blokkerte deltakere før kvote eller R2", async () => {
    mockConversationsTable({
      maybeSingle: {
        data: {
          id: CONVERSATION_ID,
          buyer_id: USER_ID,
          seller_id: "55555555-5555-5555-5555-555555555555",
        },
        error: null,
      },
    });
    rpcMock.mockResolvedValue({ data: true, error: null });
    await expect(
      uploadMessageAttachment({
        data: formData({ conversationId: CONVERSATION_ID, file: makeFile(1024) }),
      }),
    ).rejects.toThrow("blokkerte brukere");
    expect(rpcMock).toHaveBeenCalledWith("is_blocked_between", {
      _a: USER_ID,
      _b: "55555555-5555-5555-5555-555555555555",
      _conversation_id: CONVERSATION_ID,
    });
    expect(adminRpcMock).not.toHaveBeenCalled();
    expect(putObjectMock).not.toHaveBeenCalled();
  });

  it("avviser fail-closed når blokkoppslaget gir uventet null", async () => {
    mockConversationsTable({
      maybeSingle: {
        data: {
          id: CONVERSATION_ID,
          buyer_id: USER_ID,
          seller_id: "55555555-5555-5555-5555-555555555555",
        },
        error: null,
      },
    });
    rpcMock.mockResolvedValue({ data: null, error: null });
    await expect(
      uploadMessageAttachment({
        data: formData({ conversationId: CONVERSATION_ID, file: makeFile(1024) }),
      }),
    ).rejects.toMatchObject({ status: 403 });
    expect(adminRpcMock).not.toHaveBeenCalled();
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
        data: { id: CONVERSATION_ID, buyer_id: USER_ID, seller_id: "noen-andre" },
        error: null,
      },
    });
    rpcMock.mockResolvedValue({ data: false, error: null });
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
          { id: CONVERSATION_ID, buyer_id: USER_ID, seller_id: "noen-andre" },
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
