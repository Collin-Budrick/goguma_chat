import SimplePage from "@/components/simple-page";

export const metadata = {
  title: "Admin · Users | Goguma Chat",
};

const operators = [
  { name: "Mina Park", role: "Admin", status: "Active" },
  { name: "Leo Martinez", role: "Supervisor", status: "Active" },
  { name: "Eli Choi", role: "Agent", status: "Invited" },
  { name: "Addison Fox", role: "Agent", status: "Suspended" },
];

export default function AdminUsersPage() {
  return (
    <SimplePage
      title="Operator roster"
      description="Manage who can access Goguma Chat and adjust their permissions."
    >
      <table className="w-full border-separate border-spacing-y-3 text-sm text-white/70">
        <thead>
          <tr className="text-left text-xs uppercase tracking-[0.3em] text-white/40">
            <th className="px-3">Name</th>
            <th className="px-3">Role</th>
            <th className="px-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {operators.map((operator) => (
            <tr
              key={operator.name}
              className="rounded-2xl border border-white/10 bg-white/[0.03]"
            >
              <td className="rounded-l-2xl px-3 py-3 text-white">
                {operator.name}
              </td>
              <td className="px-3 py-3">{operator.role}</td>
              <td className="rounded-r-2xl px-3 py-3">{operator.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </SimplePage>
  );
}
