// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DevServerSwitch } from "./dev-server-switch";

const mocks = vi.hoisted(() => ({
  set: vi.fn(),
  lastDevAddress: vi.fn(),
  nativePlatform: vi.fn<() => "ios" | "android" | "web">(() => "android"),
}));

vi.mock("@capacitor/core", () => ({
  registerPlugin: () => ({
    set: mocks.set,
    lastDevAddress: mocks.lastDevAddress,
  }),
}));

// androidNavigationUrl (via @/lib/dev-server-url) spør plattformen her.
vi.mock("@/lib/native", () => ({
  nativePlatform: mocks.nativePlatform,
}));

// jsdom-kjøringen har window.location.host «localhost:3000»; STAGING_HOST
// mocket dit gjør at komponenten tror den står på staging og viser feltet.
vi.mock("@/hooks/use-should-show-dev-server-switch", () => ({
  STAGING_HOST: "localhost:3000",
}));

function addressInput(): HTMLInputElement {
  return screen.getByLabelText("IP-adresse og port til lokal dev-server") as HTMLInputElement;
}

function connectButton(): HTMLButtonElement {
  return screen.getByText("Koble til lokal server") as HTMLButtonElement;
}

describe("DevServerSwitch", () => {
  beforeEach(() => {
    mocks.set.mockResolvedValue(undefined);
    mocks.set.mockClear();
    mocks.lastDevAddress.mockReset();
    mocks.nativePlatform.mockReturnValue("android");
  });

  afterEach(() => cleanup());

  it("forhåndsutfyller feltet med sist brukte dev-adresse uten protokoll", async () => {
    mocks.lastDevAddress.mockResolvedValue({ url: "http://192.168.1.23:3000" });
    render(<DevServerSwitch />);

    await waitFor(() => expect(addressInput().value).toBe("192.168.1.23:3000"));
    expect(connectButton().disabled).toBe(false);
  });

  it("lar feltet stå tomt når husket adresse ikke finnes (f.eks. iOS)", async () => {
    mocks.lastDevAddress.mockResolvedValue({ url: null });
    render(<DevServerSwitch />);

    // Effekten har rukket å fullføre uten å skrive noe til feltet.
    await waitFor(() => expect(mocks.lastDevAddress).toHaveBeenCalled());
    expect(addressInput().value).toBe("");
    expect(connectButton().disabled).toBe(true);
  });

  it("kobler til den forhåndsutfylte adressen uten ny inntasting", async () => {
    mocks.lastDevAddress.mockResolvedValue({ url: "http://localhost:3000" });
    render(<DevServerSwitch />);
    await waitFor(() => expect(addressInput().value).toBe("localhost:3000"));

    fireEvent.click(connectButton());

    await waitFor(() => expect(mocks.set).toHaveBeenCalled());
    // androidNavigationUrl mapper localhost til loopback for adb reverse.
    expect(mocks.set).toHaveBeenCalledWith({ url: "http://127.0.0.1:3000/" });
  });
});
