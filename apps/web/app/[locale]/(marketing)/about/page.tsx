import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import MarketingPageShell from "@/components/marketing-page-shell";
import SimplePage from "@/components/simple-page";

type PageProps = {
  params: Promise<{ locale: string }>;
};

const paragraphKeys = ["craft", "orchestration", "mission"] as const;

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function AboutPage(props: PageProps) {
  return (
    <Suspense fallback={<MarketingPageShell sections={paragraphKeys.length} />}>
      <AboutPageContent {...props} />
    </Suspense>
  );
}

async function AboutPageContent({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "About" });

  return (
    <SimplePage title={t("title")} description={t("description")}>
      {paragraphKeys.map((key) => (
        <p key={key}>{t(`paragraphs.${key}`)}</p>
      ))}
    </SimplePage>
  );
}
