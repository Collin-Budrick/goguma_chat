"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

type AdminGateProps = {
  children: ReactNode;
};

export default function AdminGate({ children }: AdminGateProps) {
  const [status, setStatus] = useState<"checking" | "allowed" | "redirecting">(
    "checking",
  );

  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      try {
        const res = await fetch("/api/auth/me", {
          credentials: "include",
          headers: { Accept: "application/json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const payload = await res.json();
        if (payload?.role === "admin") {
          if (!cancelled) setStatus("allowed");
          return;
        }
      } catch (error) {
        console.warn("Admin gate failed", error);
      }
      if (!cancelled) {
        setStatus("redirecting");
        const callback = encodeURIComponent(
          `${window.location.pathname}${window.location.search}`,
        );
        window.location.replace(`/login?callbackUrl=${callback}`);
      }
    };
    void check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status === "allowed") {
    return <>{children}</>;
  }

  const message =
    status === "redirecting"
      ? "Redirecting to sign in…"
      : "Checking admin access…";

  return (
    <main
      aria-busy
      className="grid min-h-screen place-items-center bg-black text-sm text-white/60"
    >
      {message}
    </main>
  );
}
