import { useState } from "react";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { emptyTermGroup, type TermGroup } from "@/lib/term-groups";

type RuleType = "all" | "any" | "exclude";

const ruleLabels: Record<RuleType, string> = {
  all: "Skal inneholde",
  any: "Kan inneholde",
  exclude: "Skal ikke inneholde",
};

export function SearchRuleFields({
  q,
  qMode,
  extraGroups,
  onQChange,
  onExtraGroupsChange,
  onSubmit,
  mobile = false,
}: {
  q: string;
  qMode: "all" | "any";
  extraGroups: TermGroup[];
  onQChange: (q: string) => void;
  onExtraGroupsChange: (groups: TermGroup[]) => void;
  onSubmit?: () => void;
  mobile?: boolean;
}) {
  const [drafts, setDrafts] = useState<Partial<Record<RuleType, string>>>({});
  const types: RuleType[] = ["all", "any", "exclude"];
  const termsFor = (type: RuleType) => [
    ...(type === qMode ? q.trim().split(/\s+/).filter(Boolean) : []),
    ...extraGroups
      .filter((group) =>
        type === "exclude" ? group.exclude : !group.exclude && group.mode === type,
      )
      .flatMap((group) => group.terms),
  ];
  const setTerms = (type: RuleType, value: string) => {
    const terms = [...new Set(value.split(/[\s,]+/).filter(Boolean))];
    const matches = (group: TermGroup) =>
      type === "exclude" ? group.exclude : !group.exclude && group.mode === type;
    const others = extraGroups.filter((group) => !matches(group));
    if (type === qMode) {
      onQChange(terms.join(" "));
      onExtraGroupsChange(others);
    } else {
      const existing = extraGroups.find(matches);
      onExtraGroupsChange(
        terms.length
          ? [
              ...others,
              {
                ...(existing ?? emptyTermGroup(type === "exclude")),
                mode: type === "exclude" ? "any" : type,
                exclude: type === "exclude",
                terms,
              },
            ]
          : others,
      );
    }
  };

  return (
    <div className={mobile ? "space-y-4" : "space-y-2"}>
      {types.map((type) => (
        <div key={type} className={mobile ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
          <Label
            htmlFor={`search-rule-${type}`}
            className={mobile ? "text-sm font-medium" : "w-40 text-sm"}
          >
            {ruleLabels[type]}
          </Label>
          <Input
            id={`search-rule-${type}`}
            aria-describedby="search-rules-help"
            className={mobile ? "h-12 text-base" : "min-w-48 flex-1"}
            value={drafts[type] ?? termsFor(type).join(" ")}
            onChange={(event) => {
              setDrafts((current) => ({ ...current, [type]: event.target.value }));
              setTerms(type, event.target.value);
            }}
            onBlur={() =>
              setDrafts((current) => {
                const next = { ...current };
                delete next[type];
                return next;
              })
            }
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                event.currentTarget.blur();
                onSubmit?.();
              }
            }}
            placeholder="Skriv søkeord"
          />
        </div>
      ))}
      <p id="search-rules-help" className="text-xs text-muted-foreground">
        Du kan skrive flere ord. Skill ordene med mellomrom eller komma.
      </p>
    </div>
  );
}
