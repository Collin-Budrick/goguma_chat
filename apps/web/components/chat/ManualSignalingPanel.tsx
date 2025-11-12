"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";

import { manualSignaling } from "@/lib/manual-signaling-store";

import { useManualSignaling } from "./useManualSignaling";

const tokenLabelClass =
  "text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-2";

const textBoxClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-white/80 break-all font-mono";

const buttonClass =
  "rounded-2xl border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-white/50 hover:text-white";

export function ManualSignalingPanel() {
  const { state } = useManualSignaling();
  const [offerInput, setOfferInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);

  const statusMessage = useMemo(() => {
    if (state.error) return state.error;
    if (state.connected) return "Peer connected";
    if (state.role === "offerer") {
      return state.awaitingAnswer
        ? "Waiting for remote answer"
        : "Share the offer token";
    }
    if (state.role === "answerer") {
      if (!state.remoteOfferToken) return "Paste the remote offer token to continue";
      if (!state.localAnswerToken) return "Generating answer token";
      return "Share the answer token with your peer";
    }
    return "Choose how you want to connect";
  }, [state]);

  const handleRoleSelect = useCallback((role: "offerer" | "answerer") => {
    manualSignaling.setRole(role);
    setOfferInput("");
    setAnswerInput("");
    setLocalError(null);
  }, []);

  const handleClear = useCallback(() => {
    manualSignaling.clearTokens();
    setOfferInput("");
    setAnswerInput("");
    setLocalError(null);
  }, []);

  const handleOfferSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      try {
        await manualSignaling.setRemoteOfferToken(offerInput);
        setLocalError(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      }
    },
    [offerInput],
  );

  const handleAnswerSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      try {
        await manualSignaling.setRemoteAnswerToken(answerInput);
        setLocalError(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      }
    },
    [answerInput],
  );

  return (
    <section className="mb-6 rounded-3xl border border-white/10 bg-white/5 p-6 text-white">
      <header className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-white/50">Peer Link</p>
          <p className="text-sm text-white/70">Exchange tokens to establish a browser-to-browser chat.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            className={buttonClass}
            onClick={() => handleRoleSelect("offerer")}
          >
            Host
          </button>
          <button
            type="button"
            className={buttonClass}
            onClick={() => handleRoleSelect("answerer")}
          >
            Join
          </button>
          <button type="button" className={buttonClass} onClick={handleClear}>
            Reset
          </button>
        </div>
      </header>

      <p className="mb-4 text-xs text-white/60">{statusMessage}</p>

      {localError ? (
        <p className="mb-4 text-xs text-red-300">{localError}</p>
      ) : null}

      {state.role === "offerer" ? (
        <div className="space-y-4">
          <div>
            <p className={tokenLabelClass}>Offer token</p>
            <p className={textBoxClass}>
              {state.localOfferToken ?? "Generating..."}
            </p>
          </div>
          <form onSubmit={handleAnswerSubmit} className="space-y-2">
            <p className={tokenLabelClass}>Paste answer token</p>
            <textarea
              value={answerInput}
              onChange={(event) => setAnswerInput(event.target.value)}
              className={`${textBoxClass} min-h-[96px]`}
              placeholder="Answer token"
            />
            <button type="submit" className={buttonClass} disabled={!answerInput.trim()}>
              Apply Answer
            </button>
          </form>
        </div>
      ) : null}

      {state.role === "answerer" ? (
        <div className="space-y-4">
          <form onSubmit={handleOfferSubmit} className="space-y-2">
            <p className={tokenLabelClass}>Paste offer token</p>
            <textarea
              value={offerInput}
              onChange={(event) => setOfferInput(event.target.value)}
              className={`${textBoxClass} min-h-[96px]`}
              placeholder="Offer token"
            />
            <button type="submit" className={buttonClass} disabled={!offerInput.trim()}>
              Apply Offer
            </button>
          </form>
          <div>
            <p className={tokenLabelClass}>Answer token</p>
            <p className={textBoxClass}>
              {state.localAnswerToken ?? "Waiting for offer"}
            </p>
          </div>
        </div>
      ) : null}
    </section>
  );
}
