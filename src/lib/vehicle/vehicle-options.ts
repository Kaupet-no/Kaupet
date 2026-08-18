/** "Hjuldrift"-alternativene brukt både i annonseopprettelse (der SVV ikke
 * kan avgjøre det automatisk) og ved redigering av publisert annonse. Kun for
 * Bil/ATV — tyngre kjøretøy (bobil/lastebil/buss) bruker
 * `getAxleConfigOptions` i stedet, se der for hvorfor. */
export const DRIVE_TYPE_OPTIONS = [
  { value: "4x4", label: "Firehjulstrekk" },
  { value: "bakhjul", label: "Bakhjulstrekk" },
  { value: "forhjul", label: "Forhjulstrekk" },
];

/** "Akselkombinasjon"-alternativene for bobil/lastebil/buss. SVV oppgir kun
 * antall akslinger (`akslinger.antallAksler`), ikke hvilke som er drivende,
 * så selgeren velger selv blant kombinasjonene som er mulige for det
 * oppgitte akseltallet — se `driveTypeFromAxles` i vehicle-lookup.server.ts
 * for hvorfor SVV-dataen ikke er nok til å avgjøre dette automatisk. */
const AXLE_CONFIG_OPTIONS_BY_AXLE_COUNT: Record<number, { value: string; label: string }[]> = {
  2: [
    { value: "4x2", label: "4x2" },
    { value: "4x4", label: "4x4" },
  ],
  3: [
    { value: "6x2", label: "6x2" },
    { value: "6x4", label: "6x4" },
    { value: "6x6", label: "6x6" },
  ],
  4: [
    { value: "8x2", label: "8x2" },
    { value: "8x4", label: "8x4" },
    { value: "8x6", label: "8x6" },
    { value: "8x8", label: "8x8" },
  ],
};

export function getAxleConfigOptions(axleCount: number | null): { value: string; label: string }[] {
  if (axleCount == null) return [];
  return AXLE_CONFIG_OPTIONS_BY_AXLE_COUNT[axleCount] ?? [];
}
