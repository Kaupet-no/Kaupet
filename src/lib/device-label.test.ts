import { describe, expect, it } from "vitest";
import { parseUserAgent } from "./device-label";

const MAC_SAFARI_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";
const IPAD_DESKTOP_UA =
  "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15";

describe("parseUserAgent", () => {
  it("gjenkjenner Android-appen uansett user_agent", () => {
    expect(parseUserAgent(null, "android")).toBe("Android-appen");
    expect(parseUserAgent("whatever", "android")).toBe("Android-appen");
  });

  it("merker native iOS-abonnement uten user_agent tydelig, ikke som ukjent nettleser", () => {
    expect(parseUserAgent(null, "ios")).toBe("Kaupet-appen (iOS)");
  });

  it("faller tilbake til ukjent nettleser når web-abonnement mangler user_agent", () => {
    expect(parseUserAgent(null, "web")).toBe("Ukjent nettleser");
  });

  it("leser en ekte Mac som Safari på Mac", () => {
    expect(parseUserAgent(MAC_SAFARI_UA, "web")).toBe("Safari på Mac");
  });

  it("leser en UA med iPad i strengen som Safari på iOS", () => {
    expect(parseUserAgent(IPAD_DESKTOP_UA, "web")).toBe("Safari på iOS");
  });
});
