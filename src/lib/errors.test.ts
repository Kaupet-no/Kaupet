import { describe, expect, it } from "vitest";
import { formatErrorMessage } from "./errors";

describe("formatErrorMessage", () => {
  it.each([
    "Unauthorized: No authorization header provided",
    "Internal Server Error",
    "Rate-limit fingerprint is not configured",
    "The resource already exists",
  ])("viser aldri engelsk melding: %s", (message) => {
    expect(formatErrorMessage(new Error(message), "Noe gikk galt")).toBe("Noe gikk galt");
  });

  it.each([
    "Du må være logget inn for å gjøre dette. Logg inn og prøv igjen.",
    "Ikke autorisert",
    "Fyll inn: Merke, Modell",
    "Kontakt support på kontakt@kaupet.no.",
    "Fant ikke kjøretøy med registreringsnummer AB12345.",
  ])("slipper norsk melding gjennom: %s", (message) => {
    expect(formatErrorMessage(new Error(message), "Noe gikk galt")).toBe(message);
  });
});
