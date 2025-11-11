
import { type MouseEvent, useCallback, useEffect, useMemo } from "react";
import {
  type MotionValue,
  type SpringOptions,
  useMotionValue,
  useSpring,
} from "framer-motion";

export interface DockHoverAnimationOptions {
  panelHeight: number;
  dockHeight: number;
  springConfig: SpringOptions;
}

export interface DockHoverAnimationResult {
  mouseX: MotionValue<number>;
  rowHeight: MotionValue<number>;
  height: MotionValue<number>;
  handlers: {
    onMouseMove: (event: MouseEvent<HTMLDivElement>) => void;
    onMouseLeave: () => void;
    onMouseEnter: (event: MouseEvent<HTMLDivElement>) => void;
  };
}

export function useDockHoverAnimation({
  panelHeight,
  dockHeight,
  springConfig,
}: DockHoverAnimationOptions): DockHoverAnimationResult {
  const mouseX = useMotionValue<number>(Infinity);
  const rowHeightValue = useMotionValue(panelHeight);
  const heightValue = useMotionValue(dockHeight);

  useEffect(() => {
    rowHeightValue.set(panelHeight);
  }, [panelHeight, rowHeightValue]);

  useEffect(() => {
    heightValue.set(dockHeight);
  }, [dockHeight, heightValue]);

  const rowHeight = useSpring(rowHeightValue, springConfig);
  const height = useSpring(heightValue, springConfig);

  const handleMouseMove = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      mouseX.set(event.pageX);
    },
    [mouseX],
  );

  const handleMouseLeave = useCallback(() => {
    mouseX.set(Infinity);
  }, [mouseX]);

  const handleMouseEnter = useCallback(
    (event: MouseEvent<HTMLDivElement>) => {
      mouseX.set(event.pageX);
    },
    [mouseX],
  );

  const handlers = useMemo(
    () => ({
      onMouseMove: handleMouseMove,
      onMouseLeave: handleMouseLeave,
      onMouseEnter: handleMouseEnter,
    }),
    [handleMouseEnter, handleMouseLeave, handleMouseMove],
  );

  return {
    mouseX,
    rowHeight,
    height,
    handlers,
  };
}
