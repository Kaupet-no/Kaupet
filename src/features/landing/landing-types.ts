export type CategoryRow = {
  id: string;
  slug: string;
  name_nb: string;
  parent_id: string | null;
  icon: string | null;
  color: string | null;
  heading_font: string | null;
  search_examples: string[] | null;
};
