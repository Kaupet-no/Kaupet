-- Gjenopprett skrivegrensen etter oppryddingen i 20261013160000.
-- NOT VALID bevarer eldre ugyldige søk med notify=false, mens nye og
-- endrede rader fortsatt må bestå den utvidede validatoren.
ALTER TABLE public.saved_searches
  ADD CONSTRAINT saved_searches_criteria_valid
  CHECK (public.saved_search_criteria_is_valid(criteria)) NOT VALID;
