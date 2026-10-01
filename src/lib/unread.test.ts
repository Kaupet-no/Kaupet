import { describe, expect, it } from "vitest";

import { isUnread, messagePreview } from "./unread";

describe("isUnread", () => {
  const at = "2026-10-01T10:00:00Z";

  it("teller ikke en samtale uten meldinger som ulest", () => {
    expect(isUnread(at, null, "seller", null)).toBe(false);
  });

  it("teller en ulest melding fra motparten", () => {
    expect(isUnread(at, "buyer", "seller", null)).toBe(true);
    expect(isUnread(at, "buyer", "seller", "2026-10-01T09:00:00Z")).toBe(true);
  });

  it("teller ikke egne eller leste meldinger", () => {
    expect(isUnread(at, "seller", "seller", null)).toBe(false);
    expect(isUnread(at, "buyer", "seller", "2026-10-01T11:00:00Z")).toBe(false);
  });
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
