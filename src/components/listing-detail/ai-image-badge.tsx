import { Badge } from "@/components/ui/badge";

/** Merke for bilder som er KI-generert ifølge C2PA-/IPTC-metadata ved
 * opplasting (se isAiGeneratedImage). */
export function AiImageBadge({ show }: { show?: boolean }) {
  if (!show) return null;
  return (
    <Badge
      variant="secondary"
      className="pointer-events-none absolute left-3 top-3 hover:bg-secondary"
      title="Bildefilen er merket som laget med kunstig intelligens"
    >
      KI-generert bilde
    </Badge>
  );
}
