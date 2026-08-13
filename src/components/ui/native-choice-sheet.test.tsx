// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { NativeChoiceSheet } from "./native-choice-sheet";

vi.mock("@/lib/native", () => ({ isNative: () => false }));

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverMock);
Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

const options = [
  { value: "used", label: "Brukt", count: 12 },
  { value: "new", label: "Ny" },
];

describe("NativeChoiceSheet", () => {
  it("updates a single selection and closes without an explicit apply", () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const { getByText } = render(
      <NativeChoiceSheet
        open
        onOpenChange={onOpenChange}
        title="Velg tilstand"
        options={options}
        value={[]}
        onChange={onChange}
      />,
    );

    fireEvent.click(getByText("Brukt"));

    expect(onChange).toHaveBeenCalledWith(["used"]);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps multiselect choices local until the user applies", () => {
    const onChange = vi.fn();
    const onApply = vi.fn();
    const { getByText } = render(
      <NativeChoiceSheet
        open
        onOpenChange={() => {}}
        title="Velg tilstand"
        options={options}
        value={["used"]}
        onChange={onChange}
        multiple
        onApply={onApply}
      />,
    );

    fireEvent.click(getByText("Ny"));

    expect(onChange).not.toHaveBeenCalled();

    fireEvent.click(getByText("Bruk valg"));

    expect(onChange).toHaveBeenCalledWith(["used", "new"]);
    expect(onApply).toHaveBeenCalledOnce();
  });

  it("discards a multiselect draft when the sheet closes", () => {
    const onChange = vi.fn();
    const onOpenChange = vi.fn();
    const { getByText, rerender } = render(
      <NativeChoiceSheet
        open
        onOpenChange={onOpenChange}
        title="Velg tilstand"
        options={options}
        value={["used"]}
        onChange={onChange}
        multiple
        onApply={() => {}}
      />,
    );

    fireEvent.click(getByText("Ny"));
    rerender(
      <NativeChoiceSheet
        open={false}
        onOpenChange={onOpenChange}
        title="Velg tilstand"
        options={options}
        value={["used"]}
        onChange={onChange}
        multiple
        onApply={() => {}}
      />,
    );

    expect(onChange).not.toHaveBeenCalled();
  });
});
