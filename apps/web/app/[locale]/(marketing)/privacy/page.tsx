import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import MarketingPageShell from "@/components/marketing-page-shell";
import SimplePage from "@/components/simple-page";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function PrivacyPage(props: PageProps) {
  return (
    <Suspense fallback={<MarketingPageShell sections={2} itemsPerSection={2} />}>
      <PrivacyPageContent {...props} />
    </Suspense>
  );
}

async function PrivacyPageContent({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Privacy" });

  return (
    <SimplePage title={t("title")} description={t("description")}>
      <p>{t("body.storage")}</p>
      <p>
        {t("body.contact")} {" "}
        <a
          className="underline decoration-white/40 underline-offset-4"
          href="mailto:privacy@goguma.chat"
        >
          privacy@goguma.chat
        </a>
        .
      </p>
    </SimplePage>
  );
}
