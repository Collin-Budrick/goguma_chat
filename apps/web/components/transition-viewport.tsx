"use client";

import {
  AnimatePresence,
  motion,
  type Variants,
} from "framer-motion";
import { usePathname } from "next/navigation";
import type { PropsWithChildren } from "react";
import { useTransitionDirection } from "./transition-context";

const slideVariants: Variants = {
  enter: (direction: 1 | -1) => ({
    x: direction === 1 ? -160 : 160,
    opacity: 1,
    position: "absolute",
    width: "100%",
  }),
  center: {
    x: 0,
    opacity: 1,
    position: "relative",
    width: "100%",
  },
  exit: (direction: 1 | -1) => ({
    x: direction === 1 ? 160 : -160,
    opacity: 1,
    position: "absolute",
    width: "100%",
  }),
};

export default function TransitionViewport({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { direction } = useTransitionDirection();

  return (
    <div className="relative flex-1 overflow-hidden">
      <AnimatePresence initial={false} custom={direction}>
        <motion.div
          key={pathname}
          custom={direction}
          variants={slideVariants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{
            type: "spring",
            stiffness: 220,
            damping: 26,
          }}
          className="h-full"
          style={{ height: "100%" }}
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
