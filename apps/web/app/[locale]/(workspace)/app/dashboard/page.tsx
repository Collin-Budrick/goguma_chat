import { Suspense } from "react";
import { getTranslations } from "next-intl/server";

type PageProps = {
  params: Promise<{ locale: string }>;
};

const METRIC_KEYS = ["openConversations", "firstResponse", "resolvedToday"] as const;
const QUEUE_KEYS = ["priority", "billing", "feedback", "logistics"] as const;

export default function DashboardPage(props: PageProps) {
  return (
    <Suspense fallback={<DashboardFallback />}>
      <DashboardContent {...props} />
    </Suspense>
  );
}

async function DashboardContent({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Dashboard" });

  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr,1fr]">
      <section className="space-y-6">
        <header>
          <h2 className="text-xl font-semibold text-white">{t("metrics.title")}</h2>
          <p className="text-sm text-white/60">{t("metrics.description")}</p>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          {METRIC_KEYS.map((key) => (
            <article
              key={key}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
            >
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">
                {t(`metrics.items.${key}.label`)}
              </p>
              <p className="mt-4 text-3xl font-semibold text-white">
                {t(`metrics.items.${key}.value`)}
              </p>
              <p className="mt-2 text-xs text-white/60">
                {t(`metrics.items.${key}.delta`)}
              </p>
            </article>
          ))}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/70">
          <h3 className="text-lg font-semibold text-white">{t("spotlight.title")}</h3>
          <p className="mt-2 leading-6">{t("spotlight.body")}</p>
        </div>
      </section>
      <aside className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header>
          <h2 className="text-lg font-semibold text-white">{t("queues.title")}</h2>
          <p className="text-xs text-white/60">{t("queues.description")}</p>
        </header>
        <ul className="space-y-3 text-sm text-white/70">
          {QUEUE_KEYS.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3"
            >
              <span className="text-white">{t(`queues.items.${key}.name`)}</span>
              <span>
                <span className="text-white/80">{t(`queues.items.${key}.count`)}</span>{" "}
                <span className="text-white/50">{t(`queues.items.${key}.status`)}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function DashboardFallback() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr,1fr]">
      <section className="space-y-6">
        <header className="space-y-1.5">
          <div className="h-6 w-48 rounded-full bg-white/5" />
          <div className="h-4 w-80 max-w-full rounded-full bg-white/5" />
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          {METRIC_KEYS.map((key) => (
            <article
              key={key}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
            >
              <div className="h-3 w-28 rounded-full bg-white/5" />
              <div className="mt-4 h-10 w-24 rounded-full bg-white/5" />
              <div className="mt-2 h-3 w-32 rounded-full bg-white/5" />
            </article>
          ))}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6">
          <div className="h-5 w-44 rounded-full bg-white/5" />
          <div className="mt-4 space-y-3">
            <div className="h-3 w-full rounded-full bg-white/5" />
            <div className="h-3 w-11/12 rounded-full bg-white/5" />
            <div className="h-3 w-4/5 rounded-full bg-white/5" />
          </div>
        </div>
      </section>
      <aside className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header className="space-y-1.5">
          <div className="h-5 w-40 rounded-full bg-white/5" />
          <div className="h-3 w-32 rounded-full bg-white/5" />
        </header>
        <ul className="space-y-3 text-sm text-white/70">
          {QUEUE_KEYS.map((key) => (
            <li
              key={key}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3"
            >
              <span className="h-4 w-24 rounded-full bg-white/5" />
              <span className="h-4 w-14 rounded-full bg-white/5" />
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
