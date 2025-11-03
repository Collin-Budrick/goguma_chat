import SimplePage from "../../components/simple-page";

const fields = [
  { label: "Display name", value: "Mina Park" },
  { label: "Role", value: "Customer Success Lead" },
  { label: "Status", value: "Available" },
  { label: "Time zone", value: "Asia/Seoul (GMT+9)" },
];

export const metadata = {
  title: "Profile | Goguma Chat",
  description: "Review your identity and presence settings inside Goguma Chat.",
};

export default function ProfilePage() {
  return (
    <SimplePage
      title="Your profile"
      description="Control how your teammates see you across conversations."
    >
      <dl className="grid gap-4 text-sm">
        {fields.map((field) => (
          <div key={field.label} className="rounded-2xl border border-white/10 p-4">
            <dt className="text-xs uppercase tracking-[0.3em] text-white/40">
              {field.label}
            </dt>
            <dd className="mt-2 text-white">{field.value}</dd>
          </div>
        ))}
      </dl>
    </SimplePage>
  );
}
