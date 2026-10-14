-- PR 337: 20261013160000 skjerper validatoren før den slår av varsling
-- for eldre ugyldige søk. CHECK gjelder også UPDATE av bare notify og ville
-- stoppet oppryddingen med 23514. Behold den pushte migrasjonen uendret;
-- fjern regelen før den kjøres og gjenopprett den i 20261013165000.
ALTER TABLE public.saved_searches
  DROP CONSTRAINT saved_searches_criteria_valid;
