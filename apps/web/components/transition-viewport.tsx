"use client";

import { AnimatePresence, motion, type Variants } from "framer-motion";
import { usePathname } from "next/navigation";
import {
  type PropsWithChildren,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useTransitionDirection } from "./transition-context";

type SlideContext = {
  direction: 1 | -1 | 0;
};

const resolveEnterOffset = ({ direction }: SlideContext) => {
  if (direction === 0) return 0;
  return direction === 1 ? "100vw" : "-100vw";
};

const resolveExitOffset = ({ direction }: SlideContext) => {
  if (direction === 0) return 0;
  return direction === 1 ? "-100vw" : "100vw";
};

const slideVariants: Variants = {
  enter: (context?: SlideContext) => {
    const ctx = context ?? { direction: 0 };
    return {
      x: resolveEnterOffset(ctx),
      opacity: 1,
      position: "absolute",
      inset: 0,
      width: "100%",
      zIndex: 0,
    };
  },
  center: {
    x: 0,
    opacity: 1,
    position: "relative",
    width: "100%",
    zIndex: 1,
  },
  exit: (context?: SlideContext) => {
    const ctx = context ?? { direction: 0 };
    return {
      x: resolveExitOffset(ctx),
      opacity: 1,
      position: "absolute",
      inset: 0,
      width: "100%",
      zIndex: 2,
    };
  },
};

type PageInstance = {
  key: string;
  node: ReactNode;
};

export default function TransitionViewport({ children }: PropsWithChildren) {
  const pathname = usePathname();
  const { direction } = useTransitionDirection();
  const transitionContext = useMemo<SlideContext>(
    () => ({ direction }),
    [direction],
  );
  const [pages, setPages] = useState<PageInstance[]>(() => [
    { key: pathname, node: children },
  ]);

  useEffect(() => {
    setPages((current) => {
      const exists = current.some((page) => page.key === pathname);
      if (exists) {
        return current.map((page) =>
          page.key === pathname ? { ...page, node: children } : page,
        );
      }
      return [...current, { key: pathname, node: children }];
    });
  }, [children, pathname]);

  return (
    <div className="relative flex-1 overflow-hidden">
      <AnimatePresence custom={transitionContext} mode="sync" initial={false}>
        {pages.map((page) => (
          <motion.div
            key={page.key}
            custom={transitionContext}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{
              type: "spring",
              stiffness: 220,
              damping: 26,
            }}
            className="w-full"
            onAnimationComplete={(definition) => {
              if (definition === "exit") {
                setPages((current) =>
                  current.filter((entry) => entry.key !== page.key),
                );
              }
            }}
          >
            {page.node}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}
