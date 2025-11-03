import SimplePage from "../../../components/simple-page";

export const metadata = {
  title: "Admin · Broadcasts | Goguma Chat",
};

const audiences = [
  "All connected workspaces",
  "Enterprise workspaces only",
  "Sandbox and staging environments",
  "Custom segment (CSV upload)",
];

export default function AdminPushPage() {
  return (
    <SimplePage
      title="Broadcast announcements"
      description="Schedule monochrome system toasts or long-form status updates."
    >
      <section className="space-y-4">
        <h2 className="text-sm font-semibold text-white">Target audience</h2>
        <ul className="grid gap-3 text-sm text-white/70">
          {audiences.map((audience) => (
            <li
              key={audience}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3"
            >
              {audience}
            </li>
          ))}
        </ul>
      </section>
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-white">Compose</h2>
        <textarea
          className="h-40 w-full resize-none rounded-xl border border-white/10 bg-black px-4 py-3 text-sm text-white shadow-inner focus:border-white/40 focus:outline-none"
          placeholder="Draft the message operators will receive…"
        />
        <div className="flex gap-3">
          <button className="rounded-full bg-white px-4 py-2 text-xs font-semibold text-black transition hover:bg-white/90">
            Send now
          </button>
          <button className="rounded-full border border-white/20 px-4 py-2 text-xs text-white transition hover:border-white">
            Schedule
          </button>
        </div>
      </section>
    </SimplePage>
  );
}
