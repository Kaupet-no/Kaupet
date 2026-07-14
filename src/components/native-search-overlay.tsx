import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, Clock, FolderOpen, Search as SearchIcon, X } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { Input } from "@/components/ui/input";
import { findCategorySuggestion, type Category } from "@/lib/categories";
import { hapticImpact } from "@/lib/haptics";

const HISTORY_KEY = "kaupet_recent_searches_v1";
const MAX_HISTORY = 5;

function getHistory(): string[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function saveToHistory(q: string) {
  if (!q.trim()) return;
  try {
    const prev = getHistory().filter((s) => s !== q.trim());
    localStorage.setItem(HISTORY_KEY, JSON.stringify([q.trim(), ...prev].slice(0, MAX_HISTORY)));
  } catch {
    /* ignore */
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  initialQ?: string;
  categories: Category[];
};

export function NativeSearchOverlay({ open, onClose, initialQ = "", categories }: Props) {
  const [q, setQ] = useState(initialQ);
  const [history, setHistory] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (open) {
      setQ(initialQ);
      setHistory(getHistory());
      // Delay to let animation start before focus (avoids keyboard jank)
      const t = setTimeout(() => inputRef.current?.focus(), 150);
      return () => clearTimeout(t);
    }
  }, [open, initialQ]);

  const categorySuggestion = useMemo(
    () => (q.length >= 2 ? findCategorySuggestion(categories, q) : null),
    [q, categories],
  );

  const submit = (value: string) => {
    if (!value.trim()) return;
    void hapticImpact("medium");
    saveToHistory(value.trim());
    navigate({ to: "/annonser", search: { q: value.trim(), category: "", sort: "new" } });
    onClose();
  };

  const goToCategory = (cat: Category) => {
    void hapticImpact("medium");
    navigate({ to: "/annonser", search: { q: "", category: cat.slug, sort: "new" } });
    onClose();
  };

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex flex-col bg-background animate-in slide-in-from-bottom-4 duration-200">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 pt-safe pb-2">
        <button
          type="button"
          onClick={() => {
            void hapticImpact("light");
            onClose();
          }}
          className="flex size-10 shrink-0 items-center justify-center rounded-full hover:bg-muted"
          aria-label="Lukk søk"
        >
          <ArrowLeft className="size-5" />
        </button>
        <div className="relative flex-1">
          <SearchIcon className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit(q);
            }}
            placeholder="Hva leter du etter?"
            className="h-11 border-0 bg-muted pl-9 pr-8 text-base focus-visible:ring-0"
            aria-label="Søk i annonser"
          />
          {q && (
            <button
              type="button"
              onClick={() => setQ("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-muted-foreground hover:text-foreground"
              aria-label="Tøm søkefelt"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
        {q.trim() && (
          <button
            type="button"
            onClick={() => submit(q)}
            className="shrink-0 text-sm font-medium text-primary"
          >
            Søk
          </button>
        )}
      </div>

      {/* Results / suggestions */}
      <div className="flex-1 overflow-y-auto px-4">
        {/* Category suggestion */}
        {categorySuggestion && (
          <button
            type="button"
            onClick={() => goToCategory(categorySuggestion)}
            className="flex w-full items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 text-left transition active:scale-[0.98] mt-3"
          >
            <FolderOpen className="size-4 shrink-0 text-primary" />
            <span className="text-sm">
              Gå til kategori:{" "}
              <span className="font-semibold text-primary">{categorySuggestion.name_nb}</span>
            </span>
          </button>
        )}

        {/* Søkehistorikk */}
        {!q && history.length > 0 && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Nylige søk
              </p>
              <button
                type="button"
                onClick={() => {
                  try {
                    localStorage.removeItem(HISTORY_KEY);
                  } catch {
                    /* ignore */
                  }
                  setHistory([]);
                }}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Slett
              </button>
            </div>
            {history.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => submit(item)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-muted active:bg-muted"
              >
                <Clock className="size-4 shrink-0 text-muted-foreground" />
                <span className="text-sm">{item}</span>
              </button>
            ))}
          </div>
        )}

        {/* Populære kategorier */}
        {!q && categories.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Bla etter kategori
            </p>
            {categories
              .filter((c) => c.parent_id === null)
              .slice(0, 8)
              .map((cat) => (
                <button
                  key={cat.id}
                  type="button"
                  onClick={() => goToCategory(cat)}
                  className="flex w-full items-center gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-muted active:bg-muted"
                >
                  <FolderOpen className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">{cat.name_nb}</span>
                </button>
              ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
