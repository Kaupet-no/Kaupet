ALTER TABLE public.categories ADD COLUMN icon TEXT;

UPDATE public.categories SET icon = 'Sofa' WHERE slug = 'mobler-og-interior';
UPDATE public.categories SET icon = 'Smartphone' WHERE slug = 'elektronikk';
UPDATE public.categories SET icon = 'Shirt' WHERE slug = 'klar-og-mote';
UPDATE public.categories SET icon = 'Baby' WHERE slug = 'barn-og-baby';
UPDATE public.categories SET icon = 'Dumbbell' WHERE slug = 'sport-og-friluft';
UPDATE public.categories SET icon = 'Home' WHERE slug = 'hage-og-utemiljo';
UPDATE public.categories SET icon = 'Wrench' WHERE slug = 'verktoy-og-byggvarer';
UPDATE public.categories SET icon = 'Gamepad2' WHERE slug = 'hobby-fritid-og-underholdning';
UPDATE public.categories SET icon = 'ChefHat' WHERE slug = 'kjokken-og-husholdning';
UPDATE public.categories SET icon = 'Palette' WHERE slug = 'antikviteter-og-kunst';
UPDATE public.categories SET icon = 'Car' WHERE slug = 'biler-og-mc';
UPDATE public.categories SET icon = 'Package' WHERE slug = 'annet';

UPDATE public.categories SET icon = 'Package' WHERE icon IS NULL;
