import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminHome" });
  return {
    title: t("metadata.title"),
  };
}

export default async function AdminHomePage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AdminHome" });

  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16 pb-32 text-white">
      <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
      <p className="mt-4 text-sm text-white/60">{t("description")}</p>
    </main>
  );
}
