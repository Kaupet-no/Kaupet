import { expectTypeOf, it } from "vitest";

import type { FactSource } from "./fact-source";

it("avgrenser faktakilder til detaljvisningens fire presentasjonskilder", () => {
  expectTypeOf<FactSource>().toEqualTypeOf<"registry" | "seller" | "kaupet" | "unknown">();
});
