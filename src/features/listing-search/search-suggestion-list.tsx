import type { MouseEvent, ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export type SearchSuggestionItem = {
  id: string;
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  kaupetCode?: string;
};

export type SearchSuggestionGroup = {
  label: string;
  items: SearchSuggestionItem[];
};

export function SearchSuggestionList({
  groups,
  variant,
  firstSuggestionRef,
  id,
}: {
  groups: SearchSuggestionGroup[];
  variant: "dropdown" | "inline";
  firstSuggestionRef?: { current: HTMLElement | null };
  id?: string;
}) {
  const isDropdown = variant === "dropdown";
  const visibleGroups = groups.filter((group) => group.items.length > 0);
  if (visibleGroups.length === 0) return null;

  return (
    <div
      id={id}
      role={isDropdown ? "listbox" : undefined}
      aria-label={isDropdown ? "Søkeforslag" : undefined}
      className={
        isDropdown
          ? "absolute left-0 top-[calc(100%+0.5rem)] z-50 w-[min(380px,calc(100vw-2rem))] overflow-hidden rounded-xl border border-border bg-card p-1 shadow-md"
          : "space-y-4"
      }
    >
      {visibleGroups.map((group) => (
        <div key={group.label}>
          <div
            className={
              isDropdown
                ? "px-3 pb-1 pt-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
                : "mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
            }
          >
            {group.label}
          </div>
          {group.items.map((item, index) => {
            const className = isDropdown
              ? "flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm hover:bg-muted focus-visible:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              : "native-touch-target flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-sm hover:bg-muted";
            const isFirst = isDropdown && group === visibleGroups[0] && index === 0;
            const setRef =
              isFirst && firstSuggestionRef
                ? (node: HTMLElement | null) => {
                    firstSuggestionRef.current = node;
                  }
                : undefined;
            const sharedProps = {
              className,
              role: isDropdown ? ("option" as const) : undefined,
              "aria-selected": isDropdown ? false : undefined,
              onMouseDown: isDropdown ? (event: MouseEvent) => event.preventDefault() : undefined,
              onClick: item.onSelect,
            };

            return item.kaupetCode ? (
              <Link
                key={item.id}
                to="/$kaupetCode"
                params={{ kaupetCode: item.kaupetCode }}
                ref={setRef}
                {...sharedProps}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </Link>
            ) : (
              <button key={item.id} type="button" ref={setRef} {...sharedProps}>
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.label}</span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}
