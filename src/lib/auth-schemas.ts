import { z } from "zod";

// Delt mellom signup (auth.tsx), tilbakestilling (tilbakestill-passord.tsx) og
// kontoinnstillinger (account-section.tsx) for å unngå at grensene driver fra hverandre.
export const passwordSchema = z.string().min(8, "Minst 8 tegn");
