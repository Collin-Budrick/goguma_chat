import { Suspense } from "react";
import { eq } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import SimplePage from "@/components/simple-page";

type PageProps = {
  params: Promise<{ locale: string }>;
};

type ProfileCopy = {
  title: string;
  description: string;
  labels: {
    displayName: string;
    role: string;
    email: string;
    timezone: string;
    created: string;
    updated: string;
  };
  values: {
    role: string;
    timezone: string;
  };
};

function formatDate(value: Date | undefined, locale: string) {
  if (!value) return "—";
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "long",
    timeStyle: "short",
  }).format(value);
}

export const dynamic = "force-static";

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Profile" });
  return {
    title: t("metadata.title"),
    description: t("metadata.description"),
  };
}

export default async function ProfilePage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Profile" });
  const copy: ProfileCopy = {
    title: t("title"),
    description: t("description"),
    labels: {
      displayName: t("fields.displayName"),
      role: t("fields.role"),
      email: t("fields.email"),
      timezone: t("fields.timezone"),
      created: t("fields.created"),
      updated: t("fields.updated"),
    },
    values: {
      role: t("values.role"),
      timezone: t("values.timezone"),
    },
  };

  return (
    <Suspense fallback={<ProfilePageSkeleton copy={copy} />}>
      <ProfileContent locale={locale} copy={copy} />
    </Suspense>
  );
}

async function ProfileContent({
  locale,
  copy,
}: {
  locale: string;
  copy: ProfileCopy;
}) {
  const session = await auth();

  if (!session?.user?.id) {
    redirect(`/${locale}/login`);
  }

  const userId = session.user.id;

  const [record] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const firstName = record?.firstName ?? session.user.firstName ?? null;
  const lastName = record?.lastName ?? session.user.lastName ?? null;

  const displayName =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ")
      : session.user.name ?? session.user.email ?? "—";

  const email = record?.email ?? session.user.email ?? "—";
  const timezone = "UTC";
  const role = copy.values.role;

  const fields = [
    { label: copy.labels.displayName, value: displayName },
    { label: copy.labels.role, value: role },
    { label: copy.labels.email, value: email },
    { label: copy.labels.timezone, value: copy.values.timezone ?? timezone },
    { label: copy.labels.created, value: formatDate(record?.createdAt, locale) },
    { label: copy.labels.updated, value: formatDate(record?.updatedAt, locale) },
  ];

  return (
    <SimplePage title={copy.title} description={copy.description}>
      <dl className="grid gap-4 text-sm">
        {fields.map((field) => (
          <div key={field.label} className="rounded-2xl border border-white/10 p-4">
            <dt className="text-xs uppercase tracking-[0.3em] text-white/40">
              {field.label}
            </dt>
            <dd className="mt-2 text-white">{field.value}</dd>
          </div>
        ))}
      </dl>
    </SimplePage>
  );
}

function ProfilePageSkeleton({ copy }: { copy: ProfileCopy }) {
  return (
    <SimplePage title={copy.title} description={copy.description}>
      <dl className="grid gap-4 text-sm">
        {Array.from({ length: 6 }, (_, index) => (
          <div
            key={index}
            className="space-y-2 rounded-2xl border border-white/10 p-4"
          >
            <div className="h-3 w-24 rounded-full bg-white/10" />
            <div className="h-4 w-48 rounded-full bg-white/10" />
          </div>
        ))}
      </dl>
    </SimplePage>
  );
}
