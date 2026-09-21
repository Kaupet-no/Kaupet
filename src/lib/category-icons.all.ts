import { type LucideIcon, icons as LUCIDE_ICONS } from "lucide-react";

import { CATEGORY_ICON_OPTIONS } from "./category-icons";

// Hele lucide-registeret — ~1600 ikoner, rundt 500 KiB. Ligger med vilje i sin
// egen modul, atskilt fra category-icons.ts, fordi det kun er ikonvelgeren i
// admin som trenger å kunne søke blant alle ikonene. Importeres denne fra kode
// som havner i forsidens modulgraf, ryker bundlebudsjettet for / umiddelbart.
export const ALL_ICON_OPTIONS: { name: string; icon: LucideIcon }[] = (() => {
  const seen = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.name));
  const extra = Object.entries(LUCIDE_ICONS)
    .filter(([name]) => !seen.has(name))
    .map(([name, icon]) => ({ name, icon: icon as LucideIcon }));
  return [...CATEGORY_ICON_OPTIONS, ...extra].sort((a, b) => a.name.localeCompare(b.name));
})();
