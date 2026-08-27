-- Reservedeler kan knyttes til alle kjøretøytypene under Bil og MC,
-- ikke bare gruppene som brukes av den registrerte kjøretøyflyten.
ALTER TABLE public.vehicle_brands
  DROP CONSTRAINT vehicle_brands_category_group_check;

ALTER TABLE public.vehicle_brands
  ADD CONSTRAINT vehicle_brands_category_group_check CHECK (
    category_group = ANY (ARRAY[
      'bil'::text,
      'motorsykkel'::text,
      'moped_atv'::text,
      'bobil_campingvogn'::text,
      'henger'::text,
      'lastebil'::text,
      'buss'::text,
      'traktor'::text,
      'anleggsmaskin'::text
    ])
  );
