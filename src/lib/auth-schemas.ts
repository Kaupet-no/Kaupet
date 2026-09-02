import { z } from "zod";

// Delt mellom signup (auth.tsx), tilbakestilling (tilbakestill-passord.tsx) og
// kontoinnstillinger (account-section.tsx) for å unngå at grensene driver fra hverandre.
export const passwordSchema = z.string().min(10, "Minst 10 tegn");
