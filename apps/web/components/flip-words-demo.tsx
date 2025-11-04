import React from "react";

import { FlipWords } from "@/components/ui/flip-words";

export default function FlipWordsDemo() {
  const words = ["better", "cute", "beautiful", "modern"];

  return (
    <div className="flex h-[40rem] items-center justify-center px-4">
      <div className="mx-auto text-4xl font-normal text-neutral-600 dark:text-neutral-400">
        Build{" "}
        <FlipWords
          words={words}
          className="px-0 text-neutral-900 dark:text-neutral-100"
        />{" "}
        <br />
        websites with Aceternity UI
      </div>
    </div>
  );
}
