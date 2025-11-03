import SimplePage from "@/components/simple-page";

const bundles = [
  {
    title: "Starter",
    sla: "Email replies in under 8 business hours.",
    price: "Included",
  },
  {
    title: "Growth",
    sla: "24/7 chat with a dedicated success manager.",
    price: "$499 / month",
  },
  {
    title: "Enterprise",
    sla: "Shared Slack channel, quarterly reviews, on-call escalation.",
    price: "Custom",
  },
];

export const metadata = {
  title: "Support | Goguma Chat",
  description: "Pick the care plan that fits your scale.",
};

export default function SupportPage() {
  return (
    <SimplePage
      title="Support plans"
      description="Choose the partnership tier that keeps your operators confident."
    >
      <div className="grid gap-6 md:grid-cols-3">
        {bundles.map((bundle) => (
          <article
            key={bundle.title}
            className="rounded-3xl border border-white/10 bg-white/[0.03] p-6"
          >
            <h2 className="text-lg font-semibold text-white">{bundle.title}</h2>
            <p className="mt-2 text-sm text-white/60">{bundle.sla}</p>
            <p className="mt-4 text-sm font-medium text-white">{bundle.price}</p>
          </article>
        ))}
      </div>
    </SimplePage>
  );
}
