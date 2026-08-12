// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SHEET_CLOSE_DRAG_PX, useSheetDragGate } from "./use-sheet-drag-gate";

describe("useSheetDragGate", () => {
  it("snaps back until the close drag distance is passed", () => {
    const setActiveSnapPoint = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useSheetDragGate({
        activeSnapPoint: 0.8,
        initialSnapPoint: 0.8,
        setActiveSnapPoint,
        onClose,
      }),
    );
    const closeSnapPoint = result.current.snapPoints[0];

    act(() => {
      result.current.dragCaptureProps.onPointerDownCapture({ clientY: 100 } as never);
      result.current.dragCaptureProps.onPointerMoveCapture({
        clientY: 100 + SHEET_CLOSE_DRAG_PX - 1,
      } as never);
      result.current.setGatedSnapPoint(closeSnapPoint);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(setActiveSnapPoint).toHaveBeenLastCalledWith(0.8);

    act(() => {
      result.current.dragCaptureProps.onPointerMoveCapture({
        clientY: 100 + SHEET_CLOSE_DRAG_PX,
      } as never);
      result.current.setGatedSnapPoint(closeSnapPoint);
    });

    expect(onClose).toHaveBeenCalledOnce();
  });

  it("returns a full-height sheet to full height after a short drag", () => {
    const setActiveSnapPoint = vi.fn();
    const onClose = vi.fn();
    const { result } = renderHook(() =>
      useSheetDragGate({
        activeSnapPoint: 1,
        initialSnapPoint: 0.8,
        setActiveSnapPoint,
        onClose,
      }),
    );

    act(() => {
      result.current.dragCaptureProps.onPointerDownCapture({ clientY: 100 } as never);
      result.current.dragCaptureProps.onPointerMoveCapture({ clientY: 150 } as never);
      result.current.setGatedSnapPoint(0.8);
    });

    expect(onClose).not.toHaveBeenCalled();
    expect(setActiveSnapPoint).toHaveBeenLastCalledWith(1);
  });
});
