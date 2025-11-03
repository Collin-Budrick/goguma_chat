"use client";

import { motion } from "framer-motion";

const STATS = [
  { label: "Active teams", value: "480+", subtext: "Scaling support daily" },
  { label: "CSAT", value: "98.4%", subtext: "Rolling 30-day average" },
  { label: "Response time", value: "47s", subtext: "Median across channels" },
];

const FEATURES = [
  {
    title: "Fluid conversations",
    description:
      "Route every thread into a shared inbox with AI assist and rich context that keeps your team in sync.",
  },
  {
    title: "Signals, not noise",
    description:
      "Summaries, smart tags, and sentiment snapshots surface the next best action without overwhelming inboxes.",
  },
  {
    title: "Deep integrations",
    description:
      "Connect calendars, CRMs, and data warehouses so every reply carries the full story of your customer.",
  },
];

const CHAT_TRANSCRIPT = [
  {
    from: "Mina",
    tone: "agent",
    message:
      "Morning! I spotted a sync pause overnight. Want me to resume the export for finance?",
  },
  {
    from: "Eli",
    tone: "customer",
    message:
      "Yes please. We updated the ledger template, so I wasn’t sure if that caused it.",
  },
  {
    from: "Mina",
    tone: "agent",
    message:
      "Good catch. I merged the template changes and restarted the job — everything is flowing again.",
  },
  {
    from: "Eli",
    tone: "customer",
    message: "Amazing. The dashboard already shows the new totals. Thanks!",
  },
];

const CALLOUTS = [
  {
    eyebrow: "Fully encrypted",
    title: "Enterprise trust, by default",
    description:
      "SOC 2 Type II controls, regional data residency, and automated redaction keep sensitive context safe.",
  },
  {
    eyebrow: "Real-time insights",
    title: "Spot trends before they escalate",
    description:
      "Understand sentiment shifts, queue spikes, and AI routing impact from one monochrome operations view.",
  },
];

const fadeUp = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0 },
};

const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1 },
};

export default function Home() {
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
            Monochrome Messaging
          </motion.div>
          <motion.h1
            variants={fadeIn}
            transition={{ delay: 0.2, duration: 0.6 }}
            className="text-4xl font-semibold tracking-tight text-white sm:text-5xl lg:text-6xl"
          >
            Crisp conversations that feel curated, even at scale.
          </motion.h1>
          <motion.p
            variants={fadeIn}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="max-w-2xl text-lg leading-relaxed text-white/70"
          >
            Goguma Chat is the OLED-native workspace where your team orchestrates
            every customer moment. Sharp contrast, real context, and AI assistance
            help your replies land with warmth.
          </motion.p>
          <motion.div
            variants={fadeIn}
            transition={{ delay: 0.4, duration: 0.6 }}
            className="flex flex-col gap-3 sm:flex-row sm:items-center"
          >
            <a
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition hover:bg-white/90"
            >
              Launch the demo
            </a>
            <a
              href="/capture"
              className="inline-flex items-center justify-center rounded-full border border-white/20 px-6 py-3 text-sm text-white transition hover:border-white hover:text-white"
            >
              Explore the toolkit
            </a>
          </motion.div>
        </div>
        <motion.aside
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.35, duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
          className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-8"
        >
          <header className="flex items-center justify-between text-sm text-white/60">
            <span className="uppercase tracking-[0.2em]">Live room</span>
            <span>Resolution time · 52s</span>
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
                  <p>{entry.message}</p>
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
            key={stat.label}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.4 }}
            transition={{ delay: index * 0.08, duration: 0.6 }}
            className="rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_12px_40px_rgba(0,0,0,0.35)]"
          >
            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              {stat.label}
            </div>
            <div className="mt-4 text-3xl font-semibold text-white">
              {stat.value}
            </div>
            <div className="mt-2 text-sm text-white/60">{stat.subtext}</div>
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
            Why Goguma Chat
          </p>
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            A calm command center for every surface.
          </h2>
          <p className="text-base leading-relaxed text-white/70">
            Teams stay grounded with our OLED-native interface: interface chrome fades
            away so voice, intent, and history stay front and center. Less glare, more
            glow.
          </p>
          <div className="space-y-4">
            {FEATURES.map((feature, index) => (
              <motion.div
                key={feature.title}
                initial={{ opacity: 0, x: -24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true, amount: 0.2 }}
                transition={{ delay: index * 0.1, duration: 0.6 }}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-6"
              >
                <h3 className="text-lg font-semibold text-white">
                  {feature.title}
                </h3>
                <p className="mt-2 text-sm leading-6 text-white/60">
                  {feature.description}
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
            Instant clarity
          </header>
          <p className="text-lg font-medium text-white">
            “Every message looks cinematic. Our agents move faster, and customers
            notice the human touch in every response.”
          </p>
          <div className="text-sm text-white/60">
            Hana Kim · Director of Support, Sweet Systems
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
            key={callout.title}
            initial={{ opacity: 0, y: 30 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ delay: index * 0.12, duration: 0.6 }}
            className="space-y-4 rounded-3xl border border-white/10 bg-black p-8 shadow-[0_14px_50px_rgba(0,0,0,0.45)]"
          >
            <div className="text-xs uppercase tracking-[0.35em] text-white/50">
              {callout.eyebrow}
            </div>
            <h3 className="text-2xl font-semibold text-white">
              {callout.title}
            </h3>
            <p className="text-sm leading-6 text-white/70">
              {callout.description}
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
              Ready to glow
            </div>
            <h2 className="text-3xl font-semibold tracking-tight">
              Bring your team into the OLED era of customer care.
            </h2>
            <p className="text-base leading-relaxed text-black/70">
              Spin up shared inboxes, connect your tools, and invite your first
              teammates in minutes. Our concierge crew will help you migrate history
              so you ship responses with confidence from day one.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <a
              href="/signup"
              className="inline-flex items-center justify-center rounded-full bg-black px-6 py-3 text-sm font-semibold text-white transition hover:bg-black/80"
            >
              Start for free
            </a>
            <a
              href="/contact"
              className="inline-flex items-center justify-center rounded-full border border-black/20 px-6 py-3 text-sm text-black transition hover:border-black/60"
            >
              Talk to sales
            </a>
          </div>
        </div>
      </motion.section>
    </main>
  );
}
