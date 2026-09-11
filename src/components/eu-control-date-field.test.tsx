// @vitest-environment jsdom
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EuControlDateField } from "./eu-control-date-field";

afterEach(cleanup);

describe("EuControlDateField", () => {
  it("viser og returnerer ISO-datoer uendret", () => {
    const onChange = vi.fn();
    render(<EuControlDateField id="eu" value="2027-03-14" onChange={onChange} />);

    const field = document.getElementById("eu") as HTMLInputElement;
    expect(field.value).toBe("2027-03-14");

    fireEvent.change(field, { target: { value: "2028-01-02" } });
    expect(onChange).toHaveBeenCalledWith("2028-01-02");
  });

  it("tillater bare datoer fra i dag og fire år frem", () => {
    vi.setSystemTime(new Date("2026-09-09T10:00:00Z"));
    render(<EuControlDateField id="eu" value="" onChange={vi.fn()} />);

    const field = document.getElementById("eu") as HTMLInputElement;
    expect(field.type).toBe("date");
    expect(field.min).toBe("2026-09-09");
    expect(field.max).toBe("2030-12-31");
    vi.useRealTimers();
  });
});
