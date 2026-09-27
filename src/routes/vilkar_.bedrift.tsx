import { createFileRoute } from "@tanstack/react-router";
import { BedriftsvilkarContent } from "@/components/legal/bedriftsvilkar-content";
import { NativePageHeader } from "@/components/native-page-header";
import { useIsNative } from "@/hooks/use-is-native";

export const Route = createFileRoute("/vilkar_/bedrift")({
  head: () => ({
    meta: [
      { title: "Vilkår for bedrifter — Kaupet.no" },
      {
        name: "description",
        content:
          "Vilkårene for bedriftskontoer på Kaupet.no: medlemmer, annonseregler, salg til forbrukere, Proff-abonnement og betaling.",
      },
      { property: "og:title", content: "Vilkår for bedrifter — Kaupet.no" },
      {
        property: "og:description",
        content: "Vilkårene for bedriftskontoer og Proff på Kaupet.no.",
      },
    ],
  }),
  component: BedriftsvilkarPage,
});

function BedriftsvilkarPage() {
  const native = useIsNative();
  return (
    <article className="mx-auto max-w-3xl px-4 py-12">
      <NativePageHeader title="Vilkår for bedrifter" />
      {!native && (
        <header className="mb-10">
          <p className="text-xs uppercase tracking-wide text-muted-foreground">Brukervilkår</p>
          <h1 className="mt-2 font-display text-4xl leading-tight tracking-tight">
            Vilkår for bedrifter
          </h1>
        </header>
      )}

      <BedriftsvilkarContent />
    </article>
  );
}
