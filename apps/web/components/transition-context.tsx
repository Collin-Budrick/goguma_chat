"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type PropsWithChildren,
} from "react";

type TransitionContextValue = {
  direction: 1 | -1 | 0;
  setDirection: (direction: 1 | -1 | 0) => void;
};

const TransitionContext = createContext<TransitionContextValue | null>(null);

export function TransitionProvider({ children }: PropsWithChildren) {
  const [direction, setDirection] = useState<1 | -1 | 0>(1);
  const value = useMemo(
    () => ({
      direction,
      setDirection,
    }),
    [direction],
  );

  return (
    <TransitionContext.Provider value={value}>
      {children}
    </TransitionContext.Provider>
  );
}

export function useTransitionDirection() {
  const ctx = useContext(TransitionContext);
  if (!ctx) {
    throw new Error(
      "useTransitionDirection must be used within a TransitionProvider",
    );
  }
  return ctx;
}
