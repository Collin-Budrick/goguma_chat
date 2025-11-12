"use client";

import { FormEvent, useCallback, useMemo, useState } from "react";

import { usePeerSignaling } from "./hooks/usePeerSignaling";
import { usePeerTrust } from "./hooks/usePeerTrust";

const tokenLabelClass =
  "text-xs font-semibold uppercase tracking-[0.2em] text-white/50 mb-2";

const textBoxClass =
  "w-full rounded-2xl border border-white/10 bg-black/40 px-4 py-3 text-xs text-white/80 break-all font-mono";

const buttonClass =
  "rounded-2xl border border-white/20 px-3 py-2 text-xs uppercase tracking-[0.2em] transition hover:border-white/50 hover:text-white";

export function ManualSignalingPanel() {
  const {
    snapshot,
    status,
    selectRole,
    reset,
    applyRemoteInvite,
    applyRemoteAnswer,
    inviteExpiresIn,
    answerExpiresIn,
  } = usePeerSignaling();
  const [inviteInput, setInviteInput] = useState("");
  const [answerInput, setAnswerInput] = useState("");
  const [localError, setLocalError] = useState<string | null>(null);
  const { state: trustState, loading: trustLoading, trust, distrust } = usePeerTrust(
    snapshot.sessionId,
  );

  const statusMessage = useMemo(() => {
    if (snapshot.error) return snapshot.error;
    if (status === "connected") return "Peer connected";
    if (status === "idle") return "Choose how you want to connect";
    if (status === "hosting") return "Preparing your invite";
    if (status === "awaiting-answer") return "Waiting for your peer to respond";
    if (status === "awaiting-invite") return "Paste the invite code to continue";
    if (status === "answering") return "Generating response for your peer";
    if (status === "ready") {
      return snapshot.role === "host"
        ? "Answer received. Establishing the channel"
        : "Share this answer with your peer";
    }
    return "";
  }, [snapshot.error, snapshot.role, status]);

  const formatDuration = useCallback((value: number | null) => {
    if (!value) return null;
    const seconds = Math.max(0, Math.floor(value / 1000));
    if (seconds <= 0) return null;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return minutes > 0
      ? `${minutes}m ${remainingSeconds}s`
      : `${remainingSeconds}s`;
  }, []);

  const handleRoleSelect = useCallback((role: "offerer" | "answerer") => {
    selectRole(role === "offerer" ? "host" : "guest");
    setInviteInput("");
    setAnswerInput("");
    setLocalError(null);
  }, [selectRole]);

  const handleClear = useCallback(() => {
    reset();
    setInviteInput("");
    setAnswerInput("");
    setLocalError(null);
  }, [reset]);

  const handleTrustToggle = useCallback(() => {
    if (!trustState.remoteFingerprint) return;
    if (trustState.trusted) {
      void distrust();
    } else {
      void trust();
    }
  }, [distrust, trust, trustState.remoteFingerprint, trustState.trusted]);

  const rotationLabel = useMemo(() => {
    if (!trustState.lastRotation) return null;
    const date = new Date(trustState.lastRotation);
    return `${date.toLocaleDateString()} ${date.toLocaleTimeString()}`;
  }, [trustState.lastRotation]);

  const handleOfferSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      try {
        await applyRemoteInvite(inviteInput);
        setLocalError(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      }
    },
    [applyRemoteInvite, inviteInput],
  );

  const handleAnswerSubmit = useCallback(
    async (event: FormEvent) => {
      event.preventDefault();
      try {
        await applyRemoteAnswer(answerInput);
        setLocalError(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : String(error));
      }
    },
    [answerInput, applyRemoteAnswer],
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

      {snapshot.role === "host" ? (
        <div className="space-y-4">
          <div>
            <p className={tokenLabelClass}>Invite code</p>
            <p className={textBoxClass}>
              {snapshot.localInvite ?? "Generating..."}
            </p>
            {inviteExpiresIn ? (
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                Expires in {formatDuration(inviteExpiresIn)}
              </p>
            ) : null}
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

      {snapshot.role === "guest" ? (
        <div className="space-y-4">
          <form onSubmit={handleOfferSubmit} className="space-y-2">
            <p className={tokenLabelClass}>Paste invite code</p>
            <textarea
              value={inviteInput}
              onChange={(event) => setInviteInput(event.target.value)}
              className={`${textBoxClass} min-h-[96px]`}
              placeholder="Invite code"
            />
            <button type="submit" className={buttonClass} disabled={!inviteInput.trim()}>
              Apply Invite
            </button>
          </form>
          <div>
            <p className={tokenLabelClass}>Answer token</p>
            <p className={textBoxClass}>
              {snapshot.localAnswer ?? "Waiting for invite"}
            </p>
            {answerExpiresIn ? (
              <p className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/40">
                Share within {formatDuration(answerExpiresIn)}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="mt-6 space-y-4 rounded-3xl border border-white/10 bg-black/20 p-4">
        <header className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/50">Fingerprint Verification</p>
            <p className="text-[11px] text-white/60">
              Compare these fingerprints with your peer (scan a QR code, read them aloud, or paste into a secure channel)
              before trusting the session.
            </p>
          </div>
          {rotationLabel ? (
            <p className="text-[10px] uppercase tracking-[0.2em] text-white/40">
              Last rotated {rotationLabel}
            </p>
          ) : null}
        </header>

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className={tokenLabelClass}>Your fingerprint</p>
            <p className={`${textBoxClass} min-h-[48px]`}>
              {trustState.localFingerprint ?? "Generating..."}
            </p>
          </div>
          <div>
            <p className={tokenLabelClass}>Peer fingerprint</p>
            <p className={`${textBoxClass} min-h-[48px]`}>
              {trustState.remoteFingerprint ?? "Waiting for peer handshake"}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={buttonClass}
            onClick={handleTrustToggle}
            disabled={trustLoading || !trustState.remoteFingerprint}
          >
            {trustState.trusted ? "Revoke Trust" : "Mark as Trusted"}
          </button>
          <p className="text-[11px] text-white/50">
            {trustState.remoteFingerprint
              ? trustState.trusted
                ? "This peer is trusted. Messages will remain end-to-end encrypted with rotating keys."
                : "Untrusted session. Confirm the fingerprint matches your peer before marking as trusted."
              : "Waiting for the peer's handshake to provide a fingerprint."}
          </p>
        </div>
      </div>
    </section>
  );
}
