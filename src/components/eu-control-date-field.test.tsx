// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { EuControlDateField } from "./eu-control-date-field";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

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

  it.each(["31.12", "2027-13-01", "snart", "æøå 🗓️"])(
    "viser ugyldig lagret dato %s som tomt felt med feil (ekvivalensklasser)",
    async (value) => {
      const { DesktopDatePicker } = await import("./desktop-date-picker");
      render(
        <DesktopDatePicker
          id="eu"
          value={value}
          min="2026-01-01"
          max="2030-12-31"
          onChange={vi.fn()}
        />,
      );
      const trigger = screen.getByRole("button", { name: "Ingen dato valgt" });
      expect(trigger.getAttribute("aria-invalid")).toBe("true");
    },
    30_000,
  );

  it("bruker shadcn-kalenderen med måned/år-nedtrekk på brede skjermer", async () => {
    vi.stubGlobal("matchMedia", (query: string) => ({
      matches: true,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
    }));
    // Forhåndslast den lazy kalenderen, så findByRole ikke avhenger av importtid.
    await import("./desktop-date-picker");
    const onChange = vi.fn();
    render(
      <EuControlDateField
        id="eu"
        value="2027-03-14"
        min="2026-01-01"
        max="2030-12-31"
        onChange={onChange}
      />,
    );

    const trigger = await screen.findByRole("button", { name: /14\.03\.2027/ });
    fireEvent.click(trigger);
    expect(await screen.findByRole("combobox", { name: "Velg år" })).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Velg måned" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /20\. mars 2027/ }));
    expect(onChange).toHaveBeenCalledWith("2027-03-20");
    vi.unstubAllGlobals();
    // Første import av react-day-picker tar flere sekunder når hele suiten kjører parallelt.
  }, 30_000);
});
