export function getListingDateMeta(
  listingStatus: string | null | undefined,
  publishedAt: string | null,
  createdAt: string,
  updatedAt: string | null,
) {
  const fmt = (s: string) =>
    new Date(s).toLocaleDateString("nb-NO", { day: "numeric", month: "long", year: "numeric" });
  if (listingStatus === "draft") return { label: "Opprettet", dateStr: fmt(createdAt) };
  const publishedDate = publishedAt ? new Date(publishedAt) : new Date(createdAt);
  const updatedDate = updatedAt ? new Date(updatedAt) : null;
  const isEditedLater =
    updatedDate != null &&
    (updatedDate.getFullYear() > publishedDate.getFullYear() ||
      updatedDate.getMonth() > publishedDate.getMonth() ||
      updatedDate.getDate() > publishedDate.getDate());
  return {
    label: isEditedLater ? "Sist redigert" : "Publisert",
    dateStr: fmt(isEditedLater && updatedAt ? updatedAt : (publishedAt ?? createdAt)),
  };
}
