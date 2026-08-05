import { useTitleBasedListingHints } from "@/features/listing-creation/use-title-based-listing-hints";
import type { AttributeMap } from "@/components/attribute-fields";

/**
 * Everything the listing-edit page derives from the title as the user
 * types: "similar listings already up" hints (excluding the listing being
 * edited itself), a WTB (want-to-buy) price match, and keyword suggestions
 * for the description — via the shared useTitleBasedListingHints core.
 * Unlike ny-annonse.tsx's useListingTitleHints, there's no category
 * suggestion here (editing an already-published listing shouldn't suggest a
 * different category off a title tweak). Pulled out of
 * mine-annonser.$id.rediger.tsx.
 */
export function useEditListingHints(params: {
  title: string;
  description: string | undefined;
  categoryId: string;
  listingId: string;
  priceNok?: number | undefined;
  isFree?: boolean;
  attributes?: AttributeMap;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setValue: (field: any, value: any, options?: any) => void;
}) {
  const { title, description, categoryId, listingId, priceNok, isFree, attributes, setValue } =
    params;

  return useTitleBasedListingHints({
    title,
    description,
    categoryId,
    excludeListingId: listingId,
    priceNok,
    isFree,
    attributes,
    setValue,
  });
}
