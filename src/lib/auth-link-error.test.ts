import { describe, expect, it } from "vitest";
import { authLinkError } from "./auth-link-error";

describe("DEF-INVITE-01: Auth link errors on every entry route", () => {
  it.each([
    ["", "#error=access_denied&error_code=otp_expired"],
    ["?error_code=otp_expired", ""],
    ["?error_description=unknown", ""],
  ])("shows a safe explanation for provider error %s %s", (query, hash) => {
    expect(authLinkError(query, hash)).toContain("utløpt");
    expect(authLinkError(query, hash)).toContain("sende invitasjonen på nytt");
  });
  it.each([
    ["", ""],
    ["?mode=signin", ""],
    ["", "#access_token=secret&type=invite"],
  ])("does not flag a valid link %s %s", (query, hash) => {
    expect(authLinkError(query, hash)).toBeNull();
  });
  it("does not display arbitrary provider text", () => {
    expect(authLinkError("?error_description=%3Cscript%3E", "")).not.toContain("<script>");
  });
});
