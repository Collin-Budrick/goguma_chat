import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { Suspense } from "react";

import MarketingPageShell from "@/components/marketing-page-shell";
import SimplePage from "@/components/simple-page";

const integrations = [
  { id: "bevy", name: "Bevy Console" },
  { id: "motion", name: "Motion One" },
  { id: "faker", name: "Faker roster" },
  { id: "iconify", name: "Iconify library" },
  { id: "unpic", name: "Unpic delivery" },
] as const;

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Integrations" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default function IntegrationsPage(props: PageProps) {
  return (
    <Suspense fallback={<MarketingPageShell sections={integrations.length} />}>
      <IntegrationsPageContent {...props} />
    </Suspense>
  );
}

async function IntegrationsPageContent({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Integrations" });

  return (
    <SimplePage title={t("title")} description={t("description")}>
      <div className="grid gap-6">
        {integrations.map((integration) => (
          <article
            key={integration.id}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
          >
            <h2 className="text-lg font-semibold text-white">
              {integration.name}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {t(`items.${integration.id}.description`)}
            </p>
          </article>
        ))}
      </div>
    </SimplePage>
  );
}
