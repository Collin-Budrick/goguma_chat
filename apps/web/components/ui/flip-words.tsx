"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";

import { cn } from "@/lib/utils";

export type FlipWordsProps = {
  words: string[];
  duration?: number;
  className?: string;
  loop?: boolean;
  onCycleComplete?: () => void;
};

export function FlipWords({
  words,
  duration = 3000,
  className,
  loop = true,
  onCycleComplete,
}: FlipWordsProps) {
  const sanitizedWords = useMemo(
    () => words.filter((word) => Boolean(word && word.length)),
    [words],
  );

  const [index, setIndex] = useState(0);
  const [isAnimating, setIsAnimating] = useState(false);
  const completionNotifiedRef = useRef(false);

  const effectiveLength = sanitizedWords.length || 1;
  const normalizedIndex = index % effectiveLength;
  const currentWord = sanitizedWords[normalizedIndex] ?? "";

  const goToNext = useCallback(() => {
    if (sanitizedWords.length <= 1) return;
    setIndex((prev) => {
      if (sanitizedWords.length <= 1) return prev;
      if (loop) {
        return (prev + 1) % sanitizedWords.length;
      }
      return Math.min(prev + 1, sanitizedWords.length - 1);
    });
    setIsAnimating(true);
  }, [loop, sanitizedWords.length]);

  useEffect(() => {
    completionNotifiedRef.current = false;
  }, [sanitizedWords, loop]);

  useEffect(() => {
    if (sanitizedWords.length <= 1) return;
    if (!loop && index >= sanitizedWords.length - 1) return;
    if (isAnimating) return;
    const timeout = window.setTimeout(goToNext, duration);
    return () => window.clearTimeout(timeout);
  }, [sanitizedWords.length, loop, index, duration, goToNext, isAnimating]);

  useEffect(() => {
    if (loop || sanitizedWords.length <= 1) return;
    if (index !== sanitizedWords.length - 1) return;
    if (isAnimating) return;
    if (completionNotifiedRef.current) return;
    completionNotifiedRef.current = true;
    onCycleComplete?.();
  }, [index, isAnimating, loop, onCycleComplete, sanitizedWords.length]);

  if (sanitizedWords.length === 0) {
    return null;
  }

  return (
    <LayoutGroup>
      <AnimatePresence
        mode="popLayout"
        onExitComplete={() => {
          setIsAnimating(false);
        }}
      >
        <motion.div
          key={`${currentWord}-${index}`}
          initial={{
            opacity: 0,
            y: 10,
          }}
          animate={{
            opacity: 1,
            y: 0,
          }}
          transition={{
            type: "spring",
            stiffness: 100,
            damping: 10,
          }}
          exit={{
            opacity: 0,
            y: -40,
            x: 40,
            filter: "blur(8px)",
            scale: 2,
            position: "absolute",
          }}
          className={cn("relative z-10 inline-block px-2 text-left", className)}
        >
          {currentWord.split(" ").map((word, wordIndex) => (
            <motion.span
              key={`${word}-${wordIndex}`}
              initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{
                delay: wordIndex * 0.3,
                duration: 0.3,
              }}
              className="inline-block whitespace-nowrap"
            >
              {word.split("").map((letter, letterIndex) => (
                <motion.span
                  key={`${word}-${letterIndex}`}
                  initial={{ opacity: 0, y: 10, filter: "blur(8px)" }}
                  animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                  transition={{
                    delay: wordIndex * 0.3 + letterIndex * 0.05,
                    duration: 0.2,
                  }}
                  className="inline-block"
                >
                  {letter}
                </motion.span>
              ))}
              <span className="inline-block">&nbsp;</span>
            </motion.span>
          ))}
        </motion.div>
      </AnimatePresence>
    </LayoutGroup>
  );
}
