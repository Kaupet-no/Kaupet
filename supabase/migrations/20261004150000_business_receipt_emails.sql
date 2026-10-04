-- E-postkvitteringer for bedriftskontoer (src/lib/business/business-emails.server.ts).
--
-- welcome_email_sent_at: velkomst-e-posten sendes første gang superbrukeren
-- kommer inn i bedriftsflaten etter bekreftet e-post (organisasjonen opprettes
-- allerede ved registrering, før bekreftelse). Feltet gjør utsendingen
-- engangs. Eksisterende bedrifter regnes som ferdig ønsket velkommen.
ALTER TABLE public.organizations
  ADD COLUMN welcome_email_sent_at timestamptz;
UPDATE public.organizations SET welcome_email_sent_at = created_at;

-- Kvittering for hver registrerte Proff-betaling er et valg bedriften tar
-- selv i fakturaprofilen. Av som standard; første betalte periode bekreftes
-- uansett.
ALTER TABLE public.organization_billing_profiles
  ADD COLUMN payment_receipts boolean NOT NULL DEFAULT false;

-- Satt når Kaupet har avsluttet Proff-avtalen fra adminpanelet
-- (adminEndProffAgreement). Da kan ikke bedriften angre oppsigelsen selv,
-- men kan bestille Proff på nytt når den betalte perioden er over.
ALTER TABLE public.organizations
  ADD COLUMN proff_ended_by_kaupet_at timestamptz;
