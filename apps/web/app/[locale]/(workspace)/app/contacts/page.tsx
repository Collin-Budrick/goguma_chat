import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import SimplePage from "@/components/simple-page";

type PageProps = {
  params: Promise<{ locale: string }>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "WorkspaceContacts" });
  return {
    title: t("metadata.title"),
  };
}

export default async function ContactsPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "WorkspaceContacts" });

  return (
    <SimplePage title={t("title")} description={t("description")}>
      <p>
        {t.rich("body", {
          link: (chunks) => (
            <a
              href="/app/chat#contacts"
              className="underline decoration-white/40 underline-offset-4 transition hover:decoration-white"
            >
              {chunks}
            </a>
          ),
        })}
      </p>
    </SimplePage>
  );
}
