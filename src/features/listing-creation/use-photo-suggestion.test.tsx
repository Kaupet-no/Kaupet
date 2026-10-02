// @vitest-environment jsdom
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { usePhotoSuggestion } from "./use-photo-suggestion";

const { suggestListingFromPhotos } = vi.hoisted(() => ({ suggestListingFromPhotos: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: () => ({ data: { enabled: true } }) }));
vi.mock("@/lib/category-suggestion.functions", () => ({
  getPhotoSuggestionAvailability: vi.fn(),
  suggestListingFromPhotos,
}));
vi.mock("@/lib/photo-suggestion-images", () => ({
  preparePhotoSuggestionImages: () => Promise.resolve(["prepared"]),
}));

const image = {
  id: "photo-1",
  file: new File(["x"], "photo.jpg", { type: "image/jpeg" }),
  thumbFile: new File(["x"], "thumb.jpg", { type: "image/jpeg" }),
  previewUrl: "blob:photo",
};

beforeEach(() => {
  vi.stubEnv("VITE_TURNSTILE_SITE_KEY", "test-site-key");
  suggestListingFromPhotos.mockResolvedValue({ status: "unavailable" });
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.clearAllMocks();
});

describe("usePhotoSuggestion", () => {
  it("venter på avkrysning før bildeforespørselen sendes", async () => {
    let resolveToken!: (token: string) => void;
    const token = new Promise<string>((resolve) => {
      resolveToken = resolve;
    });
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise: () => token,
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => {
      void result.current.analyzePhotos();
      result.current.onBeforeInteractive();
    });
    expect(suggestListingFromPhotos).not.toHaveBeenCalled();
    expect(result.current.verificationNeeded).toBe(true);
    expect(result.current.status).toBe("verifying");

    await act(async () => resolveToken("verified-token"));
    await waitFor(() =>
      expect(suggestListingFromPhotos).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ turnstileToken: "verified-token" }),
        }),
      ),
    );
  });

  it("viser verifiseringsfeil når Cloudflare ikke gir token", async () => {
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.reject(new Error("Timeout")),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => result.current.analyzePhotos());
    expect(result.current.status).toBe("verification-required");
    expect(result.current.verificationNeeded).toBe(true);
    expect(suggestListingFromPhotos).not.toHaveBeenCalled();

    act(() => result.current.onSuccess());
    expect(result.current.status).toBe("idle");
    expect(result.current.verificationNeeded).toBe(false);
  });

  it("deler ut ett token om gangen, så samtidige kall aldri får samme token", async () => {
    let issued = 0;
    const reset = vi.fn();
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    // Widgeten gir samme token til den nullstilles, som ekte Turnstile.
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve(`token-${issued}`),
      reset: () => {
        reset();
        issued += 1;
      },
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    const tokens = await act(() =>
      Promise.all([result.current.takeVerifiedToken(), result.current.takeVerifiedToken()]),
    );
    expect(tokens).toEqual(["token-0", "token-1"]);
    expect(reset).toHaveBeenCalledTimes(2);
  });

  it("nullstiller ikke widgeten når avkrysning gjenstår", async () => {
    const reset = vi.fn();
    const { result } = renderHook(() => usePhotoSuggestion({ images: [image], title: "Stol" }));
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.reject(new Error("Timeout")),
      reset,
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => {
      expect(await result.current.takeVerifiedToken()).toBeNull();
    });
    expect(reset).not.toHaveBeenCalled();
  });

  it("beholder kategoriforslaget når tittelforslaget fylles inn i feltet", async () => {
    suggestListingFromPhotos.mockResolvedValue({
      status: "pending",
      source: "photo-ai",
      categories: [
        { category_id: "c1", parent_id: "p1", name_nb: "Bil", parent_name_nb: "Kjøretøy" },
      ],
      title: "Toyota GT86",
    });
    const { result, rerender } = renderHook(
      ({ title }) => usePhotoSuggestion({ images: [image], title }),
      { initialProps: { title: "" } },
    );
    result.current.turnstileRef.current = {
      getResponsePromise: () => Promise.resolve("token"),
      reset: vi.fn(),
    } as unknown as NonNullable<typeof result.current.turnstileRef.current>;

    await act(async () => result.current.analyzePhotos());
    expect(result.current.categorySuggestions).toHaveLength(1);
    expect(result.current.titleSuggestion).toBe("Toyota GT86");
    expect(result.current.status).toBe("ok");
    expect(result.current.canRequestAttributes).toBe(true);

    // PhotosGroup fyller tittelen automatisk og melder det via
    // applyTitleSuggestion: tittelendringen er systemets egen utfylling og
    // skal ikke nullstille kategoriforslaget eller samtykket.
    act(() => result.current.applyTitleSuggestion("Toyota GT86"));
    rerender({ title: "Toyota GT86" });
    expect(result.current.categorySuggestions).toHaveLength(1);
    expect(result.current.titleSuggestion).toBeNull();
    expect(result.current.status).toBe("ok");
    expect(result.current.canRequestAttributes).toBe(true);

    // Brukerens egen tittelredigering er fortsatt ny input og nullstiller.
    rerender({ title: "Toyota GT86 2016" });
    expect(result.current.categorySuggestions).toHaveLength(0);
    expect(result.current.titleSuggestion).toBeNull();
    expect(result.current.status).toBe("idle");
    expect(result.current.canRequestAttributes).toBe(false);
  });
});
