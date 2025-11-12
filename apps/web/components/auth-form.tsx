"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";
import { useLocale, useTranslations } from "next-intl";

import { usePathname, useRouter } from "@/i18n/navigation";


function buildLocalizedPath(localeSegment: string | null, pathname: string) {
  const normalized = pathname.startsWith("/") ? pathname : `/${pathname}`;
  if (!localeSegment) {
    return normalized;
  }
  return `/${localeSegment}${normalized}`;
}

interface AuthFormProps {
  mode: "login" | "signup";
}

export default function AuthForm({ mode }: AuthFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const locale = useLocale();
  const localeSegment = typeof locale === "string" && locale.length > 0 ? locale : null;
  const fallbackCallback = buildLocalizedPath(localeSegment, "/app/dashboard");
  const callbackUrl = searchParams.get("callbackUrl") ?? fallbackCallback;
  const t = useTranslations("Auth.form");
  const isLogin = mode === "login";
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const baseFieldId = useMemo(() => {
    const sanitized =
      pathname?.replace(/[^a-z0-9]/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") ??
      "auth";
    return `${sanitized || "auth"}-${mode}`;
  }, [pathname, mode]);
  const emailId = `${baseFieldId}-email`;
  const passwordId = `${baseFieldId}-password`;
  const firstNameId = `${baseFieldId}-first-name`;
  const lastNameId = `${baseFieldId}-last-name`;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const email = (formData.get("email") as string | null)?.trim();
    const password = (formData.get("password") as string | null)?.trim() ?? null;
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
    if (!password) {
      setError(t("errors.passwordRequired"));
      return;
    }

    setError(null);
    setIsSubmitting(true);

    const signInPayload: Record<string, string | undefined> = {
      email,
      redirect: false,
      callbackUrl,
      mode,
    };
    signInPayload.password = password ?? undefined;
    if (!isLogin) {
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
          htmlFor={emailId}
          className="text-xs uppercase tracking-[0.25em] text-white/50"
        >
          {t("fields.email.label")}
        </label>
        <input
          id={emailId}
          name="email"
          type="email"
          required
          autoComplete="email"
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          placeholder={t("fields.email.placeholder")}
        />
      </div>
      <div>
        <label
          htmlFor={passwordId}
          className="text-xs uppercase tracking-[0.25em] text-white/50"
        >
          {t("fields.password.label")}
        </label>
        <input
          id={passwordId}
          name="password"
          type="password"
          required
          autoComplete={isLogin ? "current-password" : "new-password"}
          className="mt-2 w-full rounded-xl border border-white/15 bg-black/80 px-4 py-3 text-sm text-white placeholder:text-white/40 focus:border-white/40 focus:outline-none"
          placeholder={t("fields.password.placeholder")}
        />
      </div>
      {!isLogin && (
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <label
              htmlFor={firstNameId}
              className="text-xs uppercase tracking-[0.25em] text-white/50"
            >
              {firstNameLabel}
            </label>
            <input
              id={firstNameId}
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
              htmlFor={lastNameId}
              className="text-xs uppercase tracking-[0.25em] text-white/50"
            >
              {lastNameLabel}
            </label>
            <input
              id={lastNameId}
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


