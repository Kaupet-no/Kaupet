// @vitest-environment jsdom
import { useState } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";

import { TermGroupEditor } from "./term-group-editor";
import type { TermGroup } from "@/lib/term-groups";

afterEach(cleanup);

it("lar brukeren redigere og slette ord direkte i søkeregelen", () => {
  const initial: TermGroup = { id: "rule", mode: "any", exclude: false, terms: ["rød", "grønn"] };
  let current = [initial];
  function Editor() {
    const [groups, setGroups] = useState(current);
    return (
      <TermGroupEditor
        groups={groups}
        onChange={(next) => {
          current = next;
          setGroups(next);
        }}
      />
    );
  }

  const { getByRole, getByText, queryByText } = render(<Editor />);
  const input = getByRole("textbox", { name: "Ord i søkeregelen" }) as HTMLInputElement;
  expect(input.value).toBe("rød, grønn");
  expect(input.getAttribute("aria-describedby")).toBe(
    getByText("Skill flere ord med mellomrom eller komma.").id,
  );
  expect(queryByText("rød")).toBeNull();

  fireEvent.focus(input);
  fireEvent.change(input, { target: { value: "grønn, blå hvit, blå" } });
  expect(input.value).toBe("grønn, blå hvit, blå");
  expect(current[0].terms).toEqual(["grønn", "blå", "hvit"]);

  fireEvent.blur(input);
  expect(input.value).toBe("grønn, blå, hvit");
  fireEvent.change(input, { target: { value: "" } });
  expect(current[0].terms).toEqual([]);
});
