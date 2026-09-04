import { createFileRoute, Link, notFound, useNavigate, useRouter } from "@tanstack/react-router";
import { z } from "zod";
import { CategoryLandingPage } from "@/components/category-landing-page";
import { supabase } from "@/integrations/supabase/client";
import { type Category } from "@/lib/categories";
import { normalizeSlugForMatch } from "@/lib/slug";
import { searchSchema } from "@/features/listing-search/search-schema";
import { Button } from "@/components/ui/button";
import { formatErrorMessage } from "@/lib/errors";

export const Route = createFileRoute("/$kaupetCode_/$sub")({
  validateSearch: searchSchema.extend({
    // Slug of a descendant of `sub` to scope the page to, without leaving
    // this URL.
    sub2: z.string().optional(),
  }),
  loader: async ({ params }) => {
    const { data: cats, error } = await supabase
      .from("categories")
      .select("id, slug, name_nb, parent_id, icon, color")
      .eq("is_hidden", false);
    if (error) throw error;
    const all = (cats ?? []) as Category[];

    const mains = all.filter((c) => c.parent_id == null);
    const mainExact = mains.find((c) => c.slug === params.kaupetCode);
    const normalizedMainSlug = normalizeSlugForMatch(params.kaupetCode);
    const main =
      mainExact ?? mains.find((c) => normalizeSlugForMatch(c.slug) === normalizedMainSlug);
    if (!main) throw notFound();

    const kids = all.filter((c) => c.parent_id === main.id);
    const subExact = kids.find((c) => c.slug === params.sub);
    const normalizedSubSlug = normalizeSlugForMatch(params.sub);
    const sub = subExact ?? kids.find((c) => normalizeSlugForMatch(c.slug) === normalizedSubSlug);
    if (!sub) throw notFound();

    return { main, sub };
  },
  head: ({ loaderData }) => {
    if (!loaderData) return {};
    const { main, sub } = loaderData;
    const title = `${sub.name_nb} i ${main.name_nb} — Kaupet.no`;
    const description = `Se annonser i ${sub.name_nb} under ${main.name_nb} på Kaupet.no. Kjøp og selg brukt trygt og enkelt.`;
    const url = `https://kaupet.no/${main.slug}/${sub.slug}`;
    const mainUrl = `https://kaupet.no/${main.slug}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              {
                "@type": "ListItem",
                position: 1,
                name: "Alle kategorier",
                item: "https://kaupet.no/annonser",
              },
              { "@type": "ListItem", position: 2, name: main.name_nb, item: mainUrl },
              { "@type": "ListItem", position: 3, name: sub.name_nb, item: url },
            ],
          }),
        },
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "CollectionPage",
            name: title,
            description,
            url,
          }),
        },
      ],
    };
  },
  component: SubcategoryPage,
  errorComponent: SubcategoryErrorBoundary,
  notFoundComponent: () => (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Fant ikke kategorien</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Kategorien finnes ikke, eller er ikke en underkategori av det oppgitte hovedkategori.
      </p>
      <Link to="/annonser" search={{ q: "", category: "", sort: "new" }}>
        <Button className="mt-6" variant="outline">
          Se flere annonser
        </Button>
      </Link>
    </div>
  ),
});

function SubcategoryPage() {
  const { main, sub } = Route.useLoaderData();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/$kaupetCode/$sub" });
  return (
    <CategoryLandingPage
      category={sub}
      breadcrumb={[main, sub]}
      subSlug={search.sub2}
      subSlugParam="sub2"
      search={search}
      navigate={navigate}
    />
  );
}

function SubcategoryErrorBoundary({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  console.error(error);
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 text-center">
      <h1 className="font-display text-2xl">Kunne ikke laste kategorien</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {formatErrorMessage(error, "Prøv på nytt eller gå tilbake til forsiden.")}
      </p>
      <Button
        className="mt-6"
        onClick={() => {
          router.invalidate();
          reset();
        }}
      >
        Prøv på nytt
      </Button>
    </div>
  );
}
