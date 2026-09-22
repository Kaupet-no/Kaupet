import { createFileRoute, redirect } from "@tanstack/react-router";

import { searchSchema } from "@/features/listing-search/search-schema";

// Gammel fullskjerm-filterflate, fjernet i bfe454b. Filterparametrene deles
// med /annonser, så videresend dit i stedet for å 404e på delte lenker.
export const Route = createFileRoute("/annonser_/filter")({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/annonser", search, replace: true });
  },
});
