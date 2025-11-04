"use client";

import { motion } from "framer-motion";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/navigation";

import CountUp from "@/components/count-up";

const STATS = [
  { id: "activeTeams", value: 480, suffix: "+", duration: 1.2 },
  { id: "csat", value: 98.4, suffix: "%", duration: 1.4 },
  { id: "responseTime", value: 47, suffix: "s", duration: 1 },
] as const;

const FEATURES = [
  { id: "fluid" },
  { id: "signals" },
  { id: "integrations" },
] as const;

const CHAT_TRANSCRIPT = [
  { from: "Mina", tone: "agent" as const, id: "syncPause" },
  { from: "Eli", tone: "customer" as const, id: "ledgerUpdate" },
  { from: "Mina", tone: "agent" as const, id: "jobRestarted" },
  { from: "Eli", tone: "customer" as const, id: "dashboardUpdated" },
] as const;

const CALLOUTS = [
  { id: "encrypted" },
  { id: "insights" },
] as const;

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

export default function Home() {
  const t = useTranslations("Marketing");
  const tStats = useTranslations("Marketing.stats");
  const tFeatures = useTranslations("Marketing.features");
  const tCallouts = useTranslations("Marketing.callouts");
  const tChat = useTranslations("Marketing.chatMessages");

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-24 px-6 py-24 pb-10 lg:gap-32">
      <motion.section
        initial="hidden"
        animate="show"
        variants={fadeUp}
        transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
        className="grid gap-12 lg:grid-cols-[2fr,1fr] lg:items-start"
      >
        <div className="space-y-8">
          <motion.div
            variants={fadeIn}
            transition={{ delay: 0.1, duration: 0.5 }}
            className="inline-flex items-center gap-2 rounded-full border border-white/10 px-4 py-2 text-xs uppercase tracking-[0.3em] text-white/60"
          >
            {t("heroEyebrow")}
          </motion.div>
          <motion.h1
            variants={fadeIn}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            {t("heroTitle")}
          </motion.h1>
          <motion.p
            variants={fadeIn}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="max-w-2xl text-lg leading-relaxed text-white/70"
          >
            {t("heroDescription")}
          </motion.p>
          <motion.div
            variants={fadeIn}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              {t("heroPrimaryCta")}
            </Link>
            <Link
              href="/capture"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm text-white transition hover:border-white hover:text-white"
            >
              {t("heroSecondaryCta")}
            </Link>
          </motion.div>
        </div>
        <motion.aside
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
          className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
        >
          <header className="flex items-center justify-between text-sm text-white/60">
            <span className="uppercase tracking-[0.2em]">
              {t("chatLiveRoomLabel")}
            </span>
            <span>{t("chatResolutionLabel")}</span>
          </header>
          <div className="space-y-4">
            {CHAT_TRANSCRIPT.map((entry, index) => {
              const isAgent = entry.tone === "agent";
              return (
                <motion.div
                  key={`${entry.from}-${index}`}
                  initial={{ opacity: 0, x: isAgent ? 20 : -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.45 + index * 0.08, duration: 0.4 }}
                  className={`max-w-xs rounded-2xl border px-4 py-3 text-sm leading-6 ${
                    isAgent
                      ? "ml-auto border-white/40 bg-white text-black"
                      : "border-white/10 bg-black text-white"
                  }`}
                >
                  <div
                    className={`mb-1 text-xs uppercase tracking-[0.2em] ${
                      isAgent ? "text-black/50" : "text-white/50"
                    }`}
                  >
                    {entry.from}
                  </div>
                  <p>{tChat(entry.id)}</p>
                </motion.div>
              );
            })}
          </div>
        </motion.aside>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 40 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
        className="grid gap-6 sm:grid-cols-3"
      >
        {STATS.map((stat, index) => (
          <motion.div
            key={stat.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: index * 0.08, duration: 0.6 }}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
          >
            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              {tStats(`${stat.id}.label`)}
            </div>
            <div className="mt-4 text-3xl font-semibold text-white">
              <CountUp
                to={stat.value}
                suffix={stat.suffix}
                duration={stat.duration}
              />
            </div>
            <div className="mt-2 text-sm text-white/60">
              {tStats(`${stat.id}.subtext`)}
            </div>
          </motion.div>
        ))}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
        className="grid gap-12 lg:grid-cols-[1.2fr,1fr] lg:items-center"
      >
        <div className="space-y-6">
          <p className="text-sm uppercase tracking-[0.4em] text-white/50">
            {t("whyEyebrow")}
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {t("whyTitle")}
          </h2>
          <p className="text-base leading-relaxed text-white/70">
            {t("whyDescription")}
          </p>
          <div className="space-y-4">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.id}
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <h3 className="text-lg font-semibold text-white">
                  {tFeatures(`${feature.id}.title`)}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  {tFeatures(`${feature.id}.description`)}
                </p>
              </motion.div>
            ))}
          </div>
        </div>
        <motion.div
          initial={{ opacity: 0, scale: 0.94 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true, amount: 0.3 }}
          transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
          className="space-y-6 rounded-3xl border border-white/10 bg-gradient-to-br from-white/[0.08] to-transparent p-8"
        >
          <header className="text-xs uppercase tracking-[0.3em] text-white/50">
            {t("testimonialEyebrow")}
          </header>
          <p className="text-lg font-medium text-white">{t("testimonialQuote")}</p>
          <div className="text-sm text-white/60">
            {t("testimonialAttribution")}
          </div>
        </motion.div>
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
        className="grid gap-8 lg:grid-cols-2"
      >
        {CALLOUTS.map((callout, index) => (
          <motion.article
            key={callout.id}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: index * 0.12, duration: 0.6 }}
            className="space-y-4 rounded-3xl border border-white/10 bg-black p-8 shadow-[0_14px_50px_rgba(0,0,0,0.45)]"
          >
            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              {tCallouts(`${callout.id}.eyebrow`)}
            </div>
            <h3 className="text-2xl font-semibold text-white">
              {tCallouts(`${callout.id}.title`)}
            </h3>
            <p className="text-sm leading-6 text-white/70">
              {tCallouts(`${callout.id}.description`)}
            </p>
          </motion.article>
        ))}
      </motion.section>

      <motion.section
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, amount: 0.2 }}
        transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
        className="overflow-hidden rounded-3xl border border-white/10 bg-white text-black"
      >
        <div className="grid gap-8 px-8 py-12 lg:grid-cols-[1.2fr,1fr] lg:items-center">
          <div className="space-y-4">
            <div className="text-xs uppercase tracking-[0.35em] text-black/60">
              {t("ctaEyebrow")}
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">
              {t("ctaTitle")}
            </h2>
            <p className="text-base leading-relaxed text-black/70">
              {t("ctaDescription")}
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/80"
            >
              {t("ctaPrimary")}
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-black/20 px-6 py-3 text-sm text-black transition hover:border-black/60"
            >
              {t("ctaSecondary")}
            </Link>
          </div>
        </div>
      </motion.section>
    </main>
  );
}
