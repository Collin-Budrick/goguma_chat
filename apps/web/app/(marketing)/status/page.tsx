import SimplePage from "@/components/simple-page";

const services = [
  { name: "Chat API", status: "Operational", note: "All clusters healthy." },
  { name: "Realtime presence", status: "Degraded", note: "Increased latency in EU West." },
  { name: "Automation engine", status: "Operational", note: "No incidents reported." },
  { name: "Exports", status: "Monitoring", note: "Queued jobs clearing after spike." },
];

export const metadata = {
  title: "Status | Goguma Chat",
  description: "Live view into Goguma Chat uptime and maintenance windows.",
};

export default function StatusPage() {
  return (
    <SimplePage
      title="Service status"
      description="Snapshots refresh every 60 seconds. Subscribe for webhooks or email updates."
    >
      <ul className="space-y-4 text-sm">
        {services.map((service) => (
          <li
            key={service.name}
            className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
          >
            <div className="flex items-center justify-between text-white">
              <span>{service.name}</span>
              <span className="text-xs uppercase tracking-[0.3em] text-white/50">
                {service.status}
              </span>
            </div>
            <p className="mt-2 text-xs text-white/60">{service.note}</p>
          </li>
        ))}
      </ul>
    </SimplePage>
  );
}
