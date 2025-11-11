import { type MouseEvent, useCallback, useMemo } from "react";
import {
  type MotionValue,
  type SpringOptions,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";

export interface DockHoverAnimationOptions {
  panelHeight: number;
  dockHeight: number;
  magnifiedSize: number;
  springConfig: SpringOptions;
}

export interface DockHoverAnimationResult {
  mouseX: MotionValue<number>;
  hover: MotionValue<number>;
  rowHeight: MotionValue<number>;
  height: MotionValue<number>;
  handlers: {
    onMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
    onMouseEnter: () => void;
  };
}

export function useDockHoverAnimation({
  panelHeight,
  dockHeight,
  magnifiedSize,
  springConfig,
}: DockHoverAnimationOptions): DockHoverAnimationResult {
  const mouseX = useMotionValue<number>(Infinity);
  const hover = useMotionValue<number>(0);

  const maxHeight = useMemo(
    () => Math.max(dockHeight, magnifiedSize + magnifiedSize / 2 + 12),
    [dockHeight, magnifiedSize],
  );

  const rowHeight = useTransform(hover, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(rowHeight, springConfig);

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      hover.set(1);
      mouseX.set(event.pageX);
    },
    [hover, mouseX],
  );

  const handleMouseLeave = useCallback(() => {
    hover.set(0);
    mouseX.set(Infinity);
  }, [hover, mouseX]);

  const handleMouseEnter = useCallback(() => {
    hover.set(1);
  }, [hover]);

  return {
    mouseX,
    hover,
    rowHeight,
    height,
    handlers: {
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
      onMouseEnter: handleMouseEnter,
    },
  };
}
