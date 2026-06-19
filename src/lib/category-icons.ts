import {
  Baby,
  Bike,
  BookOpen,
  Briefcase,
  Camera,
  Car,
  ChefHat,
  Dumbbell,
  Gamepad2,
  Gem,
  Home,
  Laptop,
  type LucideIcon,
  Music,
  Package,
  Palette,
  PawPrint,
  Shirt,
  Ship,
  Smartphone,
  Sofa,
  Trees,
  Watch,
  Wrench,
} from "lucide-react";

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
];

const CATEGORY_ICON_MAP: Record<string, LucideIcon> = Object.fromEntries(
  CATEGORY_ICON_OPTIONS.map(({ name, icon }) => [name, icon]),
);

export function getCategoryIcon(iconName: string | null | undefined): LucideIcon {
  if (!iconName) return Package;
  return CATEGORY_ICON_MAP[iconName] ?? Package;
}
