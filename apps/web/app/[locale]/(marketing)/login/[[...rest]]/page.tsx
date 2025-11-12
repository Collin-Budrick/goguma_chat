import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { Link } from "@/i18n/navigation";

import AuthForm from "@/components/auth-form";
import GradientText from "@/components/gradient-text";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Login" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function LoginPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Login" });

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-md flex-col justify-center px-6 py-16 pb-32 text-white">
      <div className="mb-8">
        <Link
          href="/"
          className="text-sm text-white/60 transition hover:text-white"
        >
          {t("backLink")}
        </Link>
      </div>
      <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-8 shadow-[0_30px_60px_rgba(0,0,0,0.45)]">
        <h1 className="text-2xl font-semibold tracking-tight">
          <GradientText className="block">{t("title")}</GradientText>
        </h1>
        <p className="mt-2 text-sm text-white/60">{t("subtitle")}</p>
        <div className="mt-8">
          <AuthForm mode="login" />
        </div>
        <p className="mt-4 text-center text-xs text-white/50">
          {t.rich("forgot", {
            link: (chunks) => (
              <Link
                href="/contact"
                className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
        <p className="mt-6 text-center text-xs text-white/50">
          {t.rich("signupPrompt", {
            link: (chunks) => (
              <Link
                href="/signup"
                className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
              >
                {chunks}
              </Link>
            ),
          })}
        </p>
      </div>
    </main>
  );
}
