"use client";

import { useEffect, useMemo, useState } from "react";

import {
  manualSignaling,
  type ManualSignalingController,
  type ManualSignalingState,
} from "@/lib/manual-signaling-store";

export function useManualSignaling(): {
  controller: ManualSignalingController;
  state: ManualSignalingState;
  dependencies: ReturnType<ManualSignalingController["createDependencies"]>;
} {
  const [state, setState] = useState<ManualSignalingState>(() => manualSignaling.getState());

  useEffect(() => manualSignaling.subscribe(setState), []);

  const dependencies = useMemo(() => manualSignaling.createDependencies(), [state.sessionId]);

  return {
    controller: manualSignaling,
    state,
    dependencies,
  };
}
