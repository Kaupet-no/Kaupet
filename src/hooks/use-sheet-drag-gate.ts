import { useCallback, useMemo, useRef, type PointerEvent } from "react";

export const SHEET_CLOSE_DRAG_PX = 72;
const CLOSE_SNAP_GAP = 0.16;

type Options = {
  activeSnapPoint: number | string | null;
  initialSnapPoint: number;
  setActiveSnapPoint: (point: number | string | null) => void;
  onClose: () => void;
};

/** Keeps Vaul velocity from closing a sheet before its boundary resistance is passed. */
export function useSheetDragGate({
  activeSnapPoint,
  initialSnapPoint,
  setActiveSnapPoint,
  onClose,
}: Options) {
  const startY = useRef<number | null>(null);
  const startSnapPoint = useRef<number | string | null>(activeSnapPoint);
  const downwardDistance = useRef(0);
  const closeSnapPoint = Math.max(0.05, initialSnapPoint - CLOSE_SNAP_GAP);
  const snapPoints = useMemo(
    () => [closeSnapPoint, initialSnapPoint, 1],
    [closeSnapPoint, initialSnapPoint],
  );

  const setGatedSnapPoint = useCallback(
    (point: number | string | null) => {
      const draggedDown =
        typeof point === "number" &&
        typeof startSnapPoint.current === "number" &&
        point < startSnapPoint.current;
      if (!draggedDown) {
        setActiveSnapPoint(point);
        return;
      }
      if (downwardDistance.current >= SHEET_CLOSE_DRAG_PX) onClose();
      else setActiveSnapPoint(startSnapPoint.current ?? initialSnapPoint);
    },
    [initialSnapPoint, onClose, setActiveSnapPoint],
  );

  const dragCaptureProps = {
    onPointerDownCapture: (event: PointerEvent) => {
      startY.current = event.clientY;
      startSnapPoint.current = activeSnapPoint;
      downwardDistance.current = 0;
    },
    onPointerMoveCapture: (event: PointerEvent) => {
      if (startY.current == null) return;
      downwardDistance.current = Math.max(0, event.clientY - startY.current);
    },
    onPointerUpCapture: () => {
      window.setTimeout(() => {
        startY.current = null;
        downwardDistance.current = 0;
      });
    },
    onPointerCancelCapture: () => {
      startY.current = null;
      downwardDistance.current = 0;
    },
  };

  return { snapPoints, setGatedSnapPoint, dragCaptureProps };
}
