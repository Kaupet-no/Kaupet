import {
  Activity,
  Anchor,
  Armchair,
  Baby,
  Backpack,
  Bike,
  Bird,
  Blocks,
  BookOpen,
  Briefcase,
  Bus,
  Camera,
  Car,
  Caravan,
  Cat,
  ChefHat,
  Compass,
  Construction,
  Container,
  Disc,
  Dog,
  Dumbbell,
  Film,
  Flower2,
  Footprints,
  Forklift,
  Fuel,
  Gamepad2,
  Gauge,
  Gem,
  Guitar,
  Hammer,
  HardHat,
  Handshake,
  Home,
  Laptop,
  Layers,
  Lightbulb,
  type LucideIcon,
  Milk,
  Mountain,
  MountainSnow,
  Motorbike,
  Music,
  Package,
  PaintRoller,
  Paintbrush,
  Palette,
  PawPrint,
  PersonStanding,
  Puzzle,
  Rabbit,
  Radio,
  Refrigerator,
  Sailboat,
  Shapes,
  Shirt,
  Ship,
  ShoppingBag,
  Smartphone,
  Snowflake,
  Sofa,
  TabletSmartphone,
  Tent,
  ToyBrick,
  Tractor,
  Trees,
  Trophy,
  Truck,
  Tv,
  User,
  UserRound,
  Van,
  Warehouse,
  Watch,
  Waves,
  Wind,
  Wrench,
  Zap,
  Cog,
  createLucideIcon,
  icons as LUCIDE_ICONS,
} from "lucide-react";

// Lucide har verken en dressjakke eller en kjole, så disse to er bygget for
// hånd — som strøk-ikoner i nøyaktig samme stil som resten av settet (samme
// stroke-width/rundede ender), i stedet for kjønnede figur-ikoner. Jakken er
// en direkte variant av lucides egen "Shirt" (samme skulder/erme/kant-form),
// bare med et V-utringet jakkeslag i stedet for rund halsåpning, pluss to
// revers-linjer, så den leser tydelig som en dressjakke og ikke en t-skjorte.
const SuitJacket = createLucideIcon("suit-jacket", [
  [
    "path",
    {
      d: "M20.38 3.46 16 2 12 7 8 2 3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z",
      key: "sj-body",
    },
  ],
  ["path", { d: "M11 8v10", key: "sj-lapel-l" }],
  ["path", { d: "M13 8v10", key: "sj-lapel-r" }],
]);

const Dress = createLucideIcon("dress", [
  [
    "path",
    {
      d: "M10 2h4l.6 2.2a2 2 0 0 0 1 1.2c.9.5 1.4 1.5 1.4 2.6v1.2c0 .8-.4 1.5-1 2 1.6 2.7 2.5 5.7 2.5 8.8a1 1 0 0 1-1 1H6.5a1 1 0 0 1-1-1c0-3.1.9-6.1 2.5-8.8-.6-.5-1-1.2-1-2V8c0-1.1.5-2.1 1.4-2.6a2 2 0 0 0 1-1.2Z",
      key: "dr-body",
    },
  ],
]);

// Forenklet, asymmetrisk salsilhuett — inspirert av et referansebilde
// brukeren delte (sadel sett skrått forfra, med én tydelig pukk/forbue på
// den ene siden, ett synlig reim og én stigbøyle) — i stedet for den
// symmetriske profilen med to buer og to stigbøyler fra forrige versjon.
// Verifisert som gjenkjennelig via en ASCII-rasterisering av strøket, siden
// skjermbilder ikke var tilgjengelig da dette ble bygget.
const Saddle = createLucideIcon("saddle", [
  [
    "path",
    {
      d: "M3 12C4 6 8 4 13 4C17 4 19 5 20 7C21 8 21 9 19 10C17 11 15 12 12 13L6 13Z",
      key: "saddle-seat",
    },
  ],
  ["path", { d: "M9 13L9.5 16.5", key: "saddle-strap" }],
  [
    "path",
    {
      d: "M6.5 17.5c0-1.1 1-2 2.5-2s2.5.9 2.5 2v1.5c0 1.4-1.1 2.5-2.5 2.5s-2.5-1.1-2.5-2.5Z",
      key: "saddle-stirrup",
    },
  ],
]);

// Lucide mangler et eget ikon for en liten, personbil-trukket tilhenger, så
// denne er bygget for hånd i samme strøk-stil som resten av settet
// (stroke-width 2, runde ender/hjørner, 24x24 viewBox).
const UtilityTrailer = createLucideIcon("utility-trailer", [
  ["path", { d: "M9 11H4l-1 2", key: "ut-drawbar" }],
  ["circle", { cx: "3.5", cy: "13.5", r: "1", key: "ut-hitch" }],
  ["rect", { x: "9", y: "9", width: "12", height: "6", key: "ut-bed" }],
  ["circle", { cx: "15", cy: "18", r: "2.2", key: "ut-wheel" }],
]);

export const CATEGORY_ICON_OPTIONS: { name: string; icon: LucideIcon }[] = [
  { name: "Sofa", icon: Sofa },
  { name: "Smartphone", icon: Smartphone },
  { name: "Shirt", icon: Shirt },
  { name: "Baby", icon: Baby },
  { name: "Dumbbell", icon: Dumbbell },
  { name: "Home", icon: Home },
  { name: "Wrench", icon: Wrench },
  { name: "Gamepad2", icon: Gamepad2 },
  { name: "ChefHat", icon: ChefHat },
  { name: "Palette", icon: Palette },
  { name: "Car", icon: Car },
  { name: "Ship", icon: Ship },
  { name: "Package", icon: Package },
  { name: "Bike", icon: Bike },
  { name: "Watch", icon: Watch },
  { name: "Laptop", icon: Laptop },
  { name: "Camera", icon: Camera },
  { name: "BookOpen", icon: BookOpen },
  { name: "PawPrint", icon: PawPrint },
  { name: "Gem", icon: Gem },
  { name: "Trees", icon: Trees },
  { name: "Music", icon: Music },
  { name: "Briefcase", icon: Briefcase },
  // Nivå 2-ikoner — hver kategori under en hovedkategori har sitt eget,
  // unike ikon, se supabase/migrations/*_category_level2_icons.sql.
  { name: "Disc", icon: Disc },
  { name: "Radio", icon: Radio },
  { name: "Cog", icon: Cog },
  { name: "Tv", icon: Tv },
  { name: "TabletSmartphone", icon: TabletSmartphone },
  { name: "Refrigerator", icon: Refrigerator },
  { name: "Zap", icon: Zap },
  { name: "Armchair", icon: Armchair },
  { name: "Lightbulb", icon: Lightbulb },
  { name: "Layers", icon: Layers },
  { name: "Flower2", icon: Flower2 },
  { name: "Hammer", icon: Hammer },
  { name: "HardHat", icon: HardHat },
  { name: "Handshake", icon: Handshake },
  { name: "User", icon: User },
  { name: "UserRound", icon: UserRound },
  { name: "PersonStanding", icon: PersonStanding },
  { name: "SuitJacket", icon: SuitJacket },
  { name: "Dress", icon: Dress },
  { name: "Saddle", icon: Saddle },
  { name: "Backpack", icon: Backpack },
  { name: "ShoppingBag", icon: ShoppingBag },
  { name: "Activity", icon: Activity },
  { name: "Trophy", icon: Trophy },
  { name: "Snowflake", icon: Snowflake },
  { name: "Tent", icon: Tent },
  { name: "Guitar", icon: Guitar },
  { name: "Dog", icon: Dog },
  { name: "Cat", icon: Cat },
  { name: "Rabbit", icon: Rabbit },
  { name: "Bird", icon: Bird },
  { name: "Footprints", icon: Footprints },
  { name: "Gauge", icon: Gauge },
  { name: "Caravan", icon: Caravan },
  { name: "Container", icon: Container },
  { name: "Wind", icon: Wind },
  { name: "Compass", icon: Compass },
  { name: "MountainSnow", icon: MountainSnow },
  { name: "Warehouse", icon: Warehouse },
  { name: "Truck", icon: Truck },
  { name: "Bus", icon: Bus },
  { name: "Tractor", icon: Tractor },
  { name: "Construction", icon: Construction },
  { name: "Paintbrush", icon: Paintbrush },
  { name: "Shapes", icon: Shapes },
  { name: "PaintRoller", icon: PaintRoller },
  { name: "Film", icon: Film },
  { name: "Blocks", icon: Blocks },
  { name: "ToyBrick", icon: ToyBrick },
  { name: "Puzzle", icon: Puzzle },
  { name: "Milk", icon: Milk },
  { name: "Sailboat", icon: Sailboat },
  { name: "Fuel", icon: Fuel },
  { name: "Anchor", icon: Anchor },
  { name: "Waves", icon: Waves },
  { name: "Van", icon: Van },
  { name: "Motorbike", icon: Motorbike },
  { name: "Mountain", icon: Mountain },
  { name: "UtilityTrailer", icon: UtilityTrailer },
  { name: "Forklift", icon: Forklift },
];

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map(({ name, icon }) => [name, icon]),
);

// Alle ikonene lucide-react leverer, i tillegg til de håndbygde egendefinerte
// ikonene over. Brukes av ikonvelgeren i admin slik at man kan søke blant og
// velge ethvert lucide-ikon, ikke bare det kuraterte utvalget i
// CATEGORY_ICON_OPTIONS (som fortsatt styrer hvilke ikoner som faktisk brukes
// på kategoriene i dag).
export const ALL_ICON_OPTIONS: { name: string; icon: LucideIcon }[] = (() => {
  const seen = new Set(CATEGORY_ICON_OPTIONS.map((o) => o.name));
  const extra = Object.entries(LUCIDE_ICONS)
    .filter(([name]) => !seen.has(name))
    .map(([name, icon]) => ({ name, icon: icon as LucideIcon }));
  return [...CATEGORY_ICON_OPTIONS, ...extra].sort((a, b) => a.name.localeCompare(b.name));
})();

export function getCategoryIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Package;
  return (
    CATEGORY_ICON_MAP[iconName] ?? (LUCIDE_ICONS as Record<string, LucideIcon>)[iconName] ?? Package
  );
}
