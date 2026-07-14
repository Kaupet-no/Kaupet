import { createFileRoute, Link, notFound, redirect } from "@tanstack/react-router";
import { z } from "zod";

import { getListingKaupetCodeById } from "@/lib/listings.functions";
import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";
import { AlertCircle } from "lucide-react";

const searchSchema = z.object({
  promotion: z.enum(["success"]).optional(),
  promo_id: z.string().uuid().optional(),
});

export const Route = createFileRoute("/annonse/$listingId")({
  validateSearch: (input: Record<string, unknown>) => {
    const parsed = searchSchema.safeParse(input);
    return parsed.success ? parsed.data : {};
  },
  head: () => ({
    meta: [{ title: "Videresender — Kaupet.no" }, { name: "robots", content: "noindex" }],
  }),
  beforeLoad: async ({ params, search }) => {
    // Legacy Vipps return-URL: send brukeren til den nye bekreftelsessiden.
    if (search.promo_id) {
      throw redirect({
        to: "/bekrefter/$promoId",
        params: { promoId: search.promo_id },
        replace: true,
      });
    }

    // Ellers: slå opp Kaupet-koden for annonsen og redirect til /$kaupetCode.
    const { kaupet_code } = await getListingKaupetCodeById({
      data: { listing_id: params.listingId },
    });
    if (!kaupet_code) throw notFound();
    throw redirect({
      to: "/$kaupetCode",
      params: { kaupetCode: kaupet_code },
      replace: true,
    });
  },
  component: () => null,
  notFoundComponent: () => (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <h1 className="font-display text-2xl">Fant ikke annonsen</h1>
      <p className="mt-2 text-muted-foreground">
        Lenken kan være utdatert. Prøv å søke etter annonsen i stedet.
      </p>
      <Button asChild className="mt-6">
        <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
          Til alle annonser
        </Link>
      </Button>
    </div>
  ),
  errorComponent: ({ error }) => (
    <div className="mx-auto max-w-md px-4 py-16 text-center">
      <AlertCircle className="mx-auto size-10 text-destructive" />
      <h1 className="mt-4 font-display text-2xl">Kunne ikke åpne annonsen</h1>
      <p className="mt-2 text-muted-foreground">{formatErrorMessage(error, "Ukjent feil")}</p>
      <Button asChild className="mt-6">
        <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
          Til alle annonser
        </Link>
      </Button>
    </div>
  ),
});
