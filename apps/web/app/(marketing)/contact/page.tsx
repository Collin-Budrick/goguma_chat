import SimplePage from "@/components/simple-page";

const supportChannels = [
  {
    label: "Email",
    value: "support@goguma.chat",
    description: "Standard response within 4 business hours.",
  },
  {
    label: "Signal hotline",
    value: "+1 (415) 555-0195",
    description: "For priority incidents and enterprise on-call.",
  },
  {
    label: "Community",
    value: "community.goguma.chat",
    description: "Share feedback, vote on features, and meet other operators.",
  },
];

export default function ContactPage() {
  return (
    <SimplePage
      title="Contact"
      description="We are here around the clock for customers and curious teams."
    >
      <p>
        Choose the channel that works best for your team. Our response desk is
        staffed 24/7 across time zones.
      </p>
      <dl className="grid gap-6 text-sm">
        {supportChannels.map((channel) => (
          <div key={channel.label}>
            <dt className="text-white">{channel.label}</dt>
            <dd className="text-white/70">
              <div>{channel.value}</div>
              <div className="text-xs text-white/50">{channel.description}</div>
            </dd>
          </div>
        ))}
      </dl>
    </SimplePage>
  );
}
