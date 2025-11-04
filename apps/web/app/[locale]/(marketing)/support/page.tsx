import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import SimplePage from "@/components/simple-page";

type PageProps = {
  params: Promise<{ locale: string }>;
};

const bundleKeys = ["starter", "growth", "enterprise"] as const;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Support" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function SupportPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Support" });

  return (
    <SimplePage title={t("title")} description={t("description")}>
      <div className="grid gap-6 md:grid-cols-3">
        {bundleKeys.map((key) => (
          <article
            key={key}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
          >
            <h2 className="text-lg font-semibold text-white">
              {t(`bundles.${key}.title`)}
            </h2>
            <p className="mt-2 text-sm text-white/60">
              {t(`bundles.${key}.sla`)}
            </p>
            <p className="mt-4 text-sm font-medium text-white">
              {t(`bundles.${key}.price`)}
            </p>
          </article>
        ))}
      </div>
    </SimplePage>
  );
}
