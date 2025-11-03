"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app/dashboard";
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string | null)?.trim();
    const firstName = (formData.get("firstName") as string | null)?.trim();
    const lastName = (formData.get("lastName") as string | null)?.trim();

    if (!email) {
      setError("Enter your work email to continue.");
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const result = await signIn("credentials", {
      email,
      firstName: firstName ?? undefined,
      lastName: lastName ?? undefined,
      redirect: false,
      callbackUrl,
    });

    setIsSubmitting(false);

    if (result?.error) {
      setError("We couldn't sign you in with those details. Try again.");
      return;
    }

    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  const heading = mode === "login" ? "Log in" : "Start your free trial";

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <label
          htmlFor="email"
          className="text-xs uppercase tracking-[0.25em] text-white/50"
        >
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          placeholder="you@example.com"
        />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <div>
          <label
            htmlFor="firstName"
            className="text-xs uppercase tracking-[0.25em] text-white/50"
          >
            First name{mode === "signup" ? " *" : " (optional)"}
          </label>
          <input
            id="firstName"
            name="firstName"
            type="text"
            autoComplete="given-name"
            required={mode === "signup"}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            placeholder="Jane"
          />
        </div>
        <div>
          <label
            htmlFor="lastName"
            className="text-xs uppercase tracking-[0.25em] text-white/50"
          >
            Last name{mode === "signup" ? " *" : " (optional)"}
          </label>
          <input
            id="lastName"
            name="lastName"
            type="text"
            autoComplete="family-name"
            required={mode === "signup"}
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            placeholder="Doe"
          />
        </div>
      </div>
      {error ? (
        <p className="rounded-xl border border-red-500/40 bg-red-500/10 px-4 py-2 text-sm text-red-100">
          {error}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded-full bg-white px-5 py-3 text-sm font-semibold text-black transition hover:bg-white/90 disabled:cursor-not-allowed disabled:opacity-80"
      >
        {isSubmitting ? "Signing in…" : heading}
      </button>
    </form>
  );
}
