"use client";

import { motion, type Variants } from "framer-motion";
import { usePathname } from "next/navigation";
import { type PropsWithChildren, useMemo } from "react";
import { useTransitionDirection } from "./transition-context";

type SlideContext = {
  direction: 1 | -1 | 0;
};

const resolveEnterOffset = ({ direction }: SlideContext) => {
  if (direction === 0) return 0;
  return direction === 1 ? "100vw" : "-100vw";
};

const slideVariants: Variants = {
  enter: (context?: SlideContext) => {
    const ctx = context ?? { direction: 0 };
    return {
      x: resolveEnterOffset(ctx),
      opacity: 1,
      position: "relative",
      width: "100%",
    };
  },
  center: {
    x: 0,
    opacity: 1,
    position: "relative",
    width: "100%",
  },
};

export default function TransitionViewport({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { direction } = useTransitionDirection();
  const transitionContext = useMemo<SlideContext>(
    () => ({ direction }),
    [direction],
  );

  return (
    <div className="relative flex-1 overflow-hidden">
      <motion.div
        key={pathname}
        custom={transitionContext}
        variants={slideVariants}
        initial="enter"
        animate="center"
        transition={{
          type: "spring",
          stiffness: 220,
          damping: 26,
        }}
        className="w-full"
      >
        {children}
      </motion.div>
    </div>
  );
}
