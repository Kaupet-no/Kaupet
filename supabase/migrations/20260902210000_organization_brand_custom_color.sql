-- Proff-bedrifter kan velge egen headerfarge i tillegg til de fire
-- forhåndsdefinerte palettene. Egendefinert farge lagres som «#rrggbb» i
-- samme kolonne; klienten (src/lib/brand-color.ts) løser opp begge former.
alter table public.organizations
  drop constraint if exists organizations_brand_palette_check;

alter table public.organizations
  add constraint organizations_brand_palette_check
  check (
    brand_palette is null
    or brand_palette in ('forest', 'navy', 'burgundy', 'slate')
    or brand_palette ~ '^#[0-9a-f]{6}$'
  );
