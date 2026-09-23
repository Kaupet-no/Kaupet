import { Fragment, useEffect, useRef, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { emptyTermGroup, type TermGroup } from "@/lib/term-groups";

type Props = {
  groups: TermGroup[];
  onChange: (groups: TermGroup[]) => void;
  deferEmpty?: boolean;
};

export function TermGroupEditor({ groups, onChange, deferEmpty = false }: Props) {
  const [pending, setPending] = useState<TermGroup | null>(() =>
    deferEmpty ? emptyTermGroup() : null,
  );

  return (
    <div className="space-y-3">
      {groups.map((g) => (
        <TermGroupRow
          key={g.id}
          group={g}
          onChange={(next) => onChange(groups.map((x) => (x.id === g.id ? next : x)))}
          onRemove={() => onChange(groups.filter((x) => x.id !== g.id))}
        />
      ))}
      {pending && (
        <TermGroupRow
          group={pending}
          deferCommit
          onChange={(next) => {
            if (next.terms.length > 0) {
              onChange([...groups, next]);
              setPending(deferEmpty ? emptyTermGroup() : null);
            } else {
              setPending(next);
            }
          }}
          onRemove={deferEmpty ? undefined : () => setPending(null)}
        />
      )}
      {!pending && !deferEmpty && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => onChange([...groups, emptyTermGroup()])}
        >
          <Plus className="size-4" /> Legg til regel
        </Button>
      )}
    </div>
  );
}

export function TermGroupRow({
  group,
  onChange,
  onRemove,
  deferCommit = false,
}: {
  group: TermGroup;
  onChange: (g: TermGroup) => void;
  onRemove?: () => void;
  deferCommit?: boolean;
}) {
  const [draft, setDraft] = useState(group.terms.join(", "));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setDraft(group.terms.join(", "));
  }, [group.terms]);

  const updateTerms = (value: string) => {
    const terms = [...new Set(value.split(/[\s,]+/).filter(Boolean))];
    if (terms.join("\0") !== group.terms.join("\0")) onChange({ ...group, terms });
  };

  return (
    <div
      className={`space-y-2 rounded-lg border p-2.5 ${
        group.exclude ? "border-destructive/40 bg-destructive/5" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={group.exclude ? "exclude" : group.mode}
          onValueChange={(value: "all" | "any" | "exclude") =>
            onChange({
              ...group,
              mode: value === "exclude" ? "any" : value,
              exclude: value === "exclude",
            })
          }
        >
          <SelectTrigger aria-label="Søkeregel" className="h-10 w-52 native:w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Må inneholde</SelectItem>
            <SelectItem value="any">Kan inneholde</SelectItem>
            <SelectItem value="exclude">Skal ikke inneholde</SelectItem>
          </SelectContent>
        </Select>
        <div className="min-w-48 flex-1 native:w-full native:flex-none">
          <Input
            aria-label="Ord i søkeregelen"
            aria-describedby={`term-group-help-${group.id}`}
            value={draft}
            onFocus={() => {
              focused.current = true;
            }}
            onChange={(e) => {
              setDraft(e.target.value);
              if (!deferCommit) updateTerms(e.target.value);
            }}
            onBlur={() => {
              focused.current = false;
              updateTerms(draft);
              setDraft([...new Set(draft.split(/[\s,]+/).filter(Boolean))].join(", "));
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.currentTarget.blur();
              }
            }}
            placeholder="Skriv søkeord"
          />
        </div>
        {onRemove && (
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={onRemove}
            className="size-10 shrink-0 text-muted-foreground"
            aria-label="Fjern søkelinje"
          >
            <Trash2 className="size-3.5" />
          </Button>
        )}
      </div>

      <p id={`term-group-help-${group.id}`} className="text-xs text-muted-foreground">
        Skill flere ord med mellomrom eller komma.
      </p>
    </div>
  );
}

export function TermGroupChips({
  group,
  onRemoveTerm,
}: {
  group: TermGroup;
  onRemoveTerm: (term: string) => void;
}) {
  if (group.terms.length === 0) return null;
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span
        className={`text-xs font-medium ${group.exclude ? "text-destructive" : "text-foreground"}`}
      >
        {group.exclude
          ? "Skal ikke inneholde:"
          : group.mode === "all"
            ? "Må inneholde:"
            : "Kan inneholde:"}
      </span>
      {group.terms.map((t, i) => (
        <Fragment key={t}>
          {i > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              {group.exclude ? "ELLER" : group.mode === "all" ? "OG" : "ELLER"}
            </span>
          )}
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs ${
              group.exclude ? "bg-destructive/10 text-destructive" : "bg-muted"
            }`}
          >
            {t}
            <button
              type="button"
              onClick={() => onRemoveTerm(t)}
              className={`-m-1.5 rounded-full p-1.5 ${
                group.exclude
                  ? "text-destructive/70 hover:text-destructive"
                  : "text-muted-foreground hover:text-foreground"
              }`}
              aria-label={`Fjern ${t}`}
            >
              <X className="size-3" />
            </button>
          </span>
        </Fragment>
      ))}
    </div>
  );
}
