## Mål
Fjerne feilmeldingen som oppstår når utloggede brukere trykker på hjerte-knappen.

## Endring
I `src/components/favorite-button.tsx`: returner `null` tidlig hvis `user` ikke er satt fra `useAuth()`.

## Effekt
- Hjerte-knappen vises ikke lenger på annonsekort eller annonse-detaljside for utloggede brukere.
- Ingen kall til `favorites`-tabellen utføres uten autentisering, og dermed ingen feilmelding.
- Innloggede brukere får uendret funksjonalitet.

Ingen andre filer eller databaseendringer kreves.