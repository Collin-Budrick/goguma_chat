"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useTranslations } from "next-intl";

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") ?? "/app/dashboard";
  const t = useTranslations("Auth.form");
  const isLogin = mode === "login";
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string | null)?.trim();
    const password = isLogin
      ? (formData.get("password") as string | null)?.trim()
      : null;
    const firstName = !isLogin
      ? (formData.get("firstName") as string | null)?.trim()
      : null;
    const lastName = !isLogin
      ? (formData.get("lastName") as string | null)?.trim()
      : null;

    if (!email) {
      setError(t("errors.emailRequired"));
      return;
    }
    if (isLogin && !password) {
      setError(t("errors.passwordRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const signInPayload: Record<string, string | undefined> = {
      email,
      redirect: false,
      callbackUrl,
    };
    if (isLogin) {
      signInPayload.password = password ?? undefined;
    } else {
      signInPayload.firstName = firstName ?? undefined;
      signInPayload.lastName = lastName ?? undefined;
    }

    const result = await signIn("credentials", signInPayload);

    setIsSubmitting(false);

    if (result?.error) {
      setError(t("errors.signInFailed"));
      return;
    }

    router.push(result?.url ?? callbackUrl);
    router.refresh();
  }

  const heading = isLogin ? t("headings.login") : t("headings.signup");
  const firstNameLabel =
    !isLogin
      ? t("fields.firstName.required")
      : t("fields.firstName.optional");
  const lastNameLabel =
    !isLogin
      ? t("fields.lastName.required")
      : t("fields.lastName.optional");

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <div>
        <label
          htmlFor="email"
          className="text-xs uppercase tracking-[0.25em] text-white/50"
        >
          {t("fields.email.label")}
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          placeholder={t("fields.email.placeholder")}
        />
      </div>
      {isLogin ? (
        <div>
          <label
            htmlFor="password"
            className="text-xs uppercase tracking-[0.25em] text-white/50"
          >
            {t("fields.password.label")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            required
            autoComplete="current-password"
            className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
            placeholder={t("fields.password.placeholder")}
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor="firstName"
              className="text-xs uppercase tracking-[0.25em] text-white/50"
            >
              {firstNameLabel}
            </label>
            <input
              id="firstName"
              name="firstName"
              type="text"
              autoComplete="given-name"
              required={!isLogin}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder={t("fields.firstName.placeholder")}
            />
          </div>
          <div>
            <label
              htmlFor="lastName"
              className="text-xs uppercase tracking-[0.25em] text-white/50"
            >
              {lastNameLabel}
            </label>
            <input
              id="lastName"
              name="lastName"
              type="text"
              autoComplete="family-name"
              required={!isLogin}
              className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
              placeholder={t("fields.lastName.placeholder")}
            />
          </div>
        </div>
      )}
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
        {isSubmitting ? t("buttons.loading") : heading}
      </button>
    </form>
  );
}
