import { z } from "zod";

// Delt mellom signup (auth.tsx), tilbakestilling (tilbakestill-passord.tsx) og
// kontoinnstillinger (account-section.tsx) for å unngå at grensene driver fra hverandre.
export const passwordSchema = z.string().min(10, "Minst 10 tegn");

// Delt mellom auth.tsx, bedriftsregistrering, kontoinnstillinger og medlemsinvitasjon.
// Tomt felt får egen melding, så brukeren ikke får «ugyldig» for noe de ikke har skrevet.
export const emailSchema = z
  .string()
  .trim()
  .min(1, "Fyll inn e-postadressen din")
  .email("Skriv inn en gyldig e-postadresse");
