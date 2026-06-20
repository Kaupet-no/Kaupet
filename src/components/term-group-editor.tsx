import { Fragment, useState } from "react";
import { Eye, EyeOff, Plus, Trash2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ModeToggle } from "@/components/mode-toggle";
import { describeTermGroup, emptyTermGroup, type TermGroup } from "@/lib/term-groups";

type Props = {
  groups: TermGroup[];
  onChange: (groups: TermGroup[]) => void;
};

export function TermGroupEditor({ groups, onChange }: Props) {
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={() => onChange([...groups, emptyTermGroup()])}
      >
        <Plus className="size-4" /> Legg til søkelinje
      </Button>
    </div>
  );
}

function TermGroupRow({
  group,
  onChange,
  onRemove,
}: {
  group: TermGroup;
  onChange: (g: TermGroup) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");

  const addTerm = () => {
    const t = draft.trim();
    if (!t) return;
    if (group.terms.includes(t)) {
      setDraft("");
      return;
    }
    onChange({ ...group, terms: [...group.terms, t] });
    setDraft("");
  };

  const removeTerm = (t: string) =>
    onChange({ ...group, terms: group.terms.filter((x) => x !== t) });

  return (
    <div
      className={`space-y-2 rounded-md border p-2.5 ${
        group.exclude ? "border-destructive/40 bg-destructive/5" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <InclusionToggle
            value={group.exclude}
            onChange={(exclude) => onChange({ ...group, exclude })}
          />
          <ModeToggle
            value={group.mode}
            onChange={(mode) => onChange({ ...group, mode })}
            labels={["Alle ord", "Minst ett"]}
          />
        </div>
        <button
          type="button"
          onClick={onRemove}
          className="-m-2 rounded p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Fjern søkelinje"
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>

      <div
        className={`flex items-center gap-1.5 text-xs ${
          group.exclude ? "text-destructive" : "text-muted-foreground"
        }`}
      >
        {group.exclude ? (
          <EyeOff className="size-3.5 shrink-0" />
        ) : (
          <Eye className="size-3.5 shrink-0" />
        )}
        {describeTermGroup(group)}
      </div>

      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTerm();
            }
          }}
          placeholder="f.eks. rød"
        />
        <Button type="button" size="sm" variant="outline" onClick={addTerm}>
          <Plus className="size-4" /> Legg til
        </Button>
      </div>

      <TermGroupChips group={group} onRemoveTerm={removeTerm} />
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
        {group.exclude ? "Skjul:" : "Vis:"}
      </span>
      {group.terms.map((t, i) => (
        <Fragment key={t}>
          {i > 0 && (
            <span className="text-xs font-medium text-muted-foreground">
              {group.mode === "all" ? "OG" : "ELLER"}
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

function InclusionToggle({
  value,
  onChange,
}: {
  value: boolean;
  onChange: (exclude: boolean) => void;
}) {
  return (
    <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-xs">
      <button
        type="button"
        onClick={() => onChange(false)}
        className={`rounded-full px-2.5 py-1 transition ${
          !value ? "bg-primary text-primary-foreground" : "text-muted-foreground"
        }`}
      >
        Vis
      </button>
      <button
        type="button"
        onClick={() => onChange(true)}
        className={`rounded-full px-2.5 py-1 transition ${
          value ? "bg-destructive text-destructive-foreground" : "text-muted-foreground"
        }`}
      >
        Ekskluder
      </button>
    </div>
  );
}
