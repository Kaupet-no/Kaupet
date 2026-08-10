import * as React from "react";
import * as SliderPrimitive from "@radix-ui/react-slider";

import { cn } from "@/lib/utils";

/**
 * Two-thumb variant of `Slider`. Radix renders one thumb per entry in `value`,
 * so the single-thumb `Slider` in ./slider.tsx can't be reused for a from–to
 * range: it hardcodes exactly one `Thumb` child.
 */
const RangeSlider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  Omit<React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>, "value" | "defaultValue"> & {
    value: [number, number];
    /** Accessible names for the two thumbs, e.g. ["Fra pris", "Til pris"]. */
    thumbLabels?: [string, string];
  }
>(({ className, value, thumbLabels, ...props }, ref) => (
  <SliderPrimitive.Root
    ref={ref}
    value={value}
    minStepsBetweenThumbs={0}
    className={cn("relative flex w-full touch-none select-none items-center py-2", className)}
    {...props}
  >
    <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-primary/20">
      <SliderPrimitive.Range className="absolute h-full bg-primary" />
    </SliderPrimitive.Track>
    {value.map((_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        aria-label={thumbLabels?.[i]}
        // after:-inset-3 pads the visible 20px thumb out to a ~44px touch
        // target without inflating the track's own hit area between thumbs.
        className="relative block size-5 rounded-full border border-primary/50 bg-background shadow transition-colors after:absolute after:-inset-3 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
      />
    ))}
  </SliderPrimitive.Root>
));
RangeSlider.displayName = "RangeSlider";

export { RangeSlider };
