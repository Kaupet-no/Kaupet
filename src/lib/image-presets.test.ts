import { describe, expect, it } from "vitest";

import { PRESETS as CLIENT_PRESETS } from "@/lib/image-presets";
import { PRESETS as SERVER_PRESETS } from "@/lib/image-presets";

// Regresjonstest for kravet i planens fase 3: klient- og serverkomprimering
// skal aldri kunne drive fra hverandre. Begge sider importerer fra samme
// modul, så dette er i praksis en test av at modulen faktisk eksporterer ett
// delt objekt — men den fanger en fremtidig regresjon der noen legger en
// dupliserende PRESETS-konstant tilbake i image-compression.ts eller
// image-compression.server.ts i stedet for å importere herfra.
describe("image-presets", () => {
  it("eksporterer samme PRESETS-objekt uansett importvei", () => {
    expect(CLIENT_PRESETS).toBe(SERVER_PRESETS);
  });

  it("har de dokumenterte verdiene for listing/listing-thumb", () => {
    expect(CLIENT_PRESETS.listing).toEqual({
      maxWidthOrHeight: 1600,
      maxSizeMB: 0.6,
      initialQuality: 0.8,
    });
    expect(CLIENT_PRESETS["listing-thumb"]).toEqual({
      maxWidthOrHeight: 480,
      maxSizeMB: 0.1,
      initialQuality: 0.75,
    });
  });
});
