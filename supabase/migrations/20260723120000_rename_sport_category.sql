-- Endrer visningsnavnet på hovedkategorien "Sport" til "Sport og friluft" —
-- slug ('sport') beholdes uendret så eksisterende lenker (/sport) fortsatt
-- fungerer.
update categories set name_nb = 'Sport og friluft' where slug = 'sport';
