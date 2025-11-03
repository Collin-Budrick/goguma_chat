import SimplePage from "@/components/simple-page";

const integrations = [
  {
    name: "Bevy Console",
    description:
      "Monitor WebGPU scenes directly inside the chat workspace with low-latency streaming previews.",
  },
  {
    name: "Motion One",
    description:
      "Trigger buttery-smooth animations that respond to customer activity and agent updates.",
  },
  {
    name: "Faker roster",
    description:
      "Generate realistic rosters for demos, QA, and onboarding runs without leaving your inbox.",
  },
  {
    name: "Iconify library",
    description:
      "Access thousands of icons to brand notifications and macros on the fly.",
  },
  {
    name: "Unpic delivery",
    description:
      "Ship lossless imagery with adaptive formats so every surface looks sharp on OLED screens.",
  },
];

export const metadata = {
  title: "Integrations | Goguma Chat",
  description:
    "Connect game engines, automations, media pipelines, and analytics to keep every conversation contextual.",
};

export default function IntegrationsPage() {
  return (
    <SimplePage
      title="Integrations"
      description="A few highlights from the tools our teams wire into the Goguma Chat workspace."
    >
      <div className="grid gap-6">
        {integrations.map((integration) => (
          <article
            key={integration.name}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 shadow-[0_12px_24px_rgba(0,0,0,0.35)]"
          >
            <h2 className="text-lg font-semibold text-white">
              {integration.name}
            </h2>
            <p className="mt-2 text-sm text-white/70">
              {integration.description}
            </p>
          </article>
        ))}
      </div>
    </SimplePage>
  );
}
