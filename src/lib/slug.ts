// Normalizes a slug (or slug-like URL segment) for matching against a
// stored category slug, so visitors can use Æ/Ø/Å or the ASCII-near forms
// AE/O/A interchangeably and get the same category regardless of case.
export function normalizeSlugForMatch(input: string): string {
  return input
    .toLowerCase()
    .replace(/æ/g, "a")
    .replace(/ae/g, "a")
    .replace(/å/g, "a")
    .replace(/ø/g, "o")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}
