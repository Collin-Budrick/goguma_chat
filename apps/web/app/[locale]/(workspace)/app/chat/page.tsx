import { getTranslations } from "next-intl/server";

type PageProps = {
  params: Promise<{ locale: string }>;
};

const THREADS = [
  { id: "4821", customer: "Avery C.", key: "shipping" },
  { id: "4820", customer: "Lucia R.", key: "webhook" },
  { id: "4819", customer: "DevOps Channel", key: "handoff" },
] as const;

const ACTIVE_MESSAGES = [
  { from: "Avery", role: "customer" as const, key: "customerGreeting" },
  { from: "Mina", role: "agent" as const, key: "agentUpdate" },
  { from: "Avery", role: "customer" as const, key: "customerThanks" },
] as const;

export default async function ChatPage({ params }: PageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Chat" });

  return (
    <div className="grid min-h-[540px] gap-6 lg:grid-cols-[280px,1fr]">
      <aside className="rounded-3xl border border-white/10 bg-white/[0.03] p-4 text-sm">
        <header className="mb-4 flex items-center justify-between text-xs uppercase tracking-[0.35em] text-white/40">
          <span>{t("sidebar.title")}</span>
          <span>{t("sidebar.new")}</span>
        </header>
        <ul className="space-y-3">
          {THREADS.map((thread, index) => (
            <li
              key={thread.id}
              className={`rounded-2xl border border-white/10 px-4 py-3 ${
                index === 0 ? "bg-white text-black" : "bg-black text-white"
              }`}
            >
              <div className="flex items-center justify-between text-xs">
                <span
                  className={index === 0 ? "text-black/60" : "text-white/60"}
                >
                  {thread.id}
                </span>
                <span
                  className={index === 0 ? "text-black/60" : "text-white/60"}
                >
                  {t(`threads.${thread.key}.time`)}
                </span>
              </div>
              <p className="mt-2 text-sm font-semibold">{thread.customer}</p>
              <p
                className={`mt-1 text-xs ${
                  index === 0 ? "text-black/60" : "text-white/60"
                }`}
              >
                {t(`threads.${thread.key}.preview`)}
              </p>
            </li>
          ))}
        </ul>
      </aside>
      <section className="flex flex-col rounded-3xl border border-white/10 bg-white/[0.02]">
        <header className="flex items-center justify-between border-b border-white/10 px-6 py-4">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-white/40">
              {t("activeThread.participant")}
            </p>
            <p className="text-sm text-white/70">{t("activeThread.topic")}</p>
          </div>
          <div className="flex items-center gap-2 text-xs text-white/50">
            <span className="rounded-full border border-white/20 px-3 py-1">
              {t("activeThread.badges.transcript")}
            </span>
            <span className="rounded-full border border-white/20 px-3 py-1">
              {t("activeThread.badges.macros")}
            </span>
          </div>
        </header>
        <div className="flex-1 space-y-4 px-6 py-6">
          {ACTIVE_MESSAGES.map((message, index) => {
            const isAgent = message.role === "agent";
            return (
              <div
                key={`${message.from}-${index}`}
                className={`max-w-lg rounded-2xl border px-4 py-3 text-sm leading-6 ${
                  isAgent
                    ? "ml-auto border-white/40 bg-white text-black"
                    : "border-white/10 bg-black text-white"
                }`}
              >
                <div
                  className={`mb-1 text-xs uppercase tracking-[0.3em] ${
                    isAgent ? "text-black/50" : "text-white/50"
                  }`}
                >
                  {message.from}
                </div>
                <p>{t(`messages.${message.key}`)}</p>
              </div>
            );
          })}
        </div>
        <footer className="border-t border-white/10 px-6 py-4">
          <form className="flex items-center gap-3">
            <textarea
              rows={1}
              placeholder={t("composer.placeholder")}
              className="flex-1 resize-none rounded-2xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
            />
            <button
              type="submit"
              className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90"
            >
              {t("composer.send")}
            </button>
          </form>
        </footer>
      </section>
    </div>
  );
}
