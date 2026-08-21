/** SVV's model text often carries a trim/variant suffix beyond the plain
 * model name (e.g. "Leaf 30kWh", "Golf GTE 1.4", "A3 e-tron"). An exact match
 * against `vehicle_models` would miss these even though the base model
 * ("Leaf", "Golf", "A3") is registered — so once an exact match fails, fall
 * back to finding an approved model name that appears as a whole word within
 * the SVV text.
 *
 * Prefers the *leftmost* match, not the longest one: manufacturer commercial
 * names conventionally put the model line first and any trim/powertrain
 * suffix after it (e.g. Audi's "A3 Sportback e-tron" — a plug-in hybrid A3,
 * not the standalone "e-tron" SUV model). A previous version of this
 * function sorted candidates by name length instead, which meant a longer
 * but unrelated approved model name occurring later in the text (like
 * Audi's separate "e-tron" model) would win over the correct, shorter,
 * earlier one ("A3") purely because it had more characters — e.g. bug
 * report: reg. DR50500, an Audi A3 e-tron, was matched to model "e-tron"
 * instead of "A3". Ties (two candidates starting at the same index — only
 * possible if one name is a prefix of the other, e.g. "A3"/"A35") fall back
 * to the longer, more specific name. Returns the *registered* row so its
 * canonical name (not the raw SVV variant text) is what gets used
 * downstream, matching the user's expectation that a known model like
 * "Leaf" is what should be selected rather than proposed as a new value. */
export function findModelContainedIn(
  models: { id: string; name: string; class_id: string | null }[],
  modelText: string,
): { id: string; name: string; class_id: string | null } | null {
  const lower = modelText.toLowerCase();
  const isWordChar = (ch: string) => /[a-z0-9æøå]/i.test(ch);
  let best: { model: { id: string; name: string; class_id: string | null }; idx: number } | null =
    null;
  for (const m of models) {
    if (m.name.trim().length === 0) continue;
    const nameLower = m.name.toLowerCase();
    const idx = lower.indexOf(nameLower);
    if (idx === -1) continue;
    const before = idx === 0 ? "" : lower[idx - 1];
    const after = idx + nameLower.length >= lower.length ? "" : lower[idx + nameLower.length];
    if (isWordChar(before) || isWordChar(after)) continue;
    if (!best || idx < best.idx || (idx === best.idx && m.name.length > best.model.name.length)) {
      best = { model: m, idx };
    }
  }
  return best?.model ?? null;
}

/**
 * Matcher brukerens egen annonsetittel mot merke- og modell-listene, slik at
 * Merke/Modell-steget i kjøretøyflyten kan være forhåndsutfylt før brukeren
 * har gjort noe som helst ("Porsche 911" → Merke: Porsche, Modell: 911).
 * Brukeren kan alltid overstyre begge i nedtrekkslistene.
 *
 * Merket matches som helt ord hvor som helst i tittelen (lengste treff
 * vinner, så "Land Rover" slår "Rover"). Modellen matches deretter kun mot
 * modellene som hører til det merket, med samme helord-regel som
 * `findModelContainedIn` bruker på SVVs modelltekst.
 */
export function matchBrandAndModelInTitle(
  title: string,
  brands: { id: string; name: string }[],
  modelsForBrand: (brandId: string) => { id: string; name: string; class_id: string | null }[],
): { brand: string; model: string | null } | null {
  const lower = title.toLowerCase();
  const isWordChar = (ch: string) => /[a-z0-9æøå]/i.test(ch);
  let best: { brand: { id: string; name: string }; idx: number } | null = null;
  for (const b of brands) {
    const nameLower = b.name.trim().toLowerCase();
    if (!nameLower) continue;
    const idx = lower.indexOf(nameLower);
    if (idx === -1) continue;
    const before = idx === 0 ? "" : lower[idx - 1];
    const after = idx + nameLower.length >= lower.length ? "" : lower[idx + nameLower.length];
    if (isWordChar(before) || isWordChar(after)) continue;
    // Lengste treff vinner, i motsetning til findModelContainedIn: et merke
    // kan inneholde et annet merkes navn som eget ord ("Land Rover"/"Rover"),
    // og da er det lengste navnet alltid det riktige.
    if (!best || b.name.length > best.brand.name.length) best = { brand: b, idx };
  }
  if (!best) return null;
  const remainder = title.slice(best.idx + best.brand.name.length);
  const model = findModelContainedIn(modelsForBrand(best.brand.id), remainder);
  // Navnene returneres som de står i vehicle_brands/vehicle_models, ikke
  // slik brukeren skrev dem — det er de kanoniske verdiene dropdownene og
  // søket bruker ("bmw" i tittelen blir "BMW").
  return { brand: best.brand.name, model: model?.name ?? null };
}
