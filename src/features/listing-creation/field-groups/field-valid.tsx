import { Check } from "lucide-react";

export function FieldValid({ show }: { show: boolean }) {
  if (!show) return null;
  return <Check className="size-4 shrink-0 text-green-500" aria-hidden />;
}
