const METRICS = [
  { label: "Open conversations", value: "42", delta: "-18% vs last week" },
  { label: "Avg first response", value: "47s", delta: "+6s vs goal" },
  { label: "Resolved today", value: "318", delta: "+12% vs yesterday" },
];

const QUEUES = [
  { name: "Priority", count: 8, status: "🟢 Stable" },
  { name: "Billing", count: 14, status: "🟡 Warming up" },
  { name: "Product feedback", count: 2, status: "🟢 Clear" },
  { name: "Logistics", count: 18, status: "🟠 Spike" },
];

export default function DashboardPage() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.3fr,1fr]">
      <section className="space-y-6">
        <header>
          <h2 className="text-xl font-semibold text-white">Live metrics</h2>
          <p className="text-sm text-white/60">
            Rolling updates refresh every 15 seconds.
          </p>
        </header>
        <div className="grid gap-4 sm:grid-cols-3">
          {METRICS.map((metric) => (
            <article
              key={metric.label}
              className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
            >
              <p className="text-xs uppercase tracking-[0.35em] text-white/50">
                {metric.label}
              </p>
              <p className="mt-4 text-3xl font-semibold text-white">
                {metric.value}
              </p>
              <p className="mt-2 text-xs text-white/60">{metric.delta}</p>
            </article>
          ))}
        </div>
        <div className="rounded-3xl border border-white/10 bg-white/[0.02] p-6 text-sm text-white/70">
          <h3 className="text-lg font-semibold text-white">
            Spotlight · Automation win
          </h3>
          <p className="mt-2 leading-6">
            AI auto-solved 63% of logistics questions this morning. Agents
            reclaimed 280 minutes and CSAT held steady at 98%.
          </p>
        </div>
      </section>
      <aside className="space-y-6 rounded-3xl border border-white/10 bg-white/[0.03] p-6">
        <header>
          <h2 className="text-lg font-semibold text-white">Queues</h2>
          <p className="text-xs text-white/60">
            Drag to reprioritize for your team.
          </p>
        </header>
        <ul className="space-y-3 text-sm text-white/70">
          {QUEUES.map((queue) => (
            <li
              key={queue.name}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-black/60 px-4 py-3"
            >
              <span className="text-white">{queue.name}</span>
              <span>
                <span className="text-white/80">{queue.count}</span>{" "}
                <span className="text-white/50">{queue.status}</span>
              </span>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
