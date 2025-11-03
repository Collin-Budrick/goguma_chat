import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
import { auth } from "@/lib/auth";
import SimplePage from "../../components/simple-page";

export const metadata = {
  title: "Profile | Goguma Chat",
  description: "Review your identity and presence settings inside Goguma Chat.",
};

function formatDate(value?: Date) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(value);
}

export default async function ProfilePage() {
  const session = await auth();

  if (!session?.user?.id) {
    redirect("/login");
  }

  const userId = session.user.id;

  const [record] = await db
    .select()
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);

  const firstName = record?.firstName ?? session.user.firstName ?? null;
  const lastName = record?.lastName ?? session.user.lastName ?? null;

  const displayName =
    firstName || lastName
      ? [firstName, lastName].filter(Boolean).join(" ")
      : session.user.name ?? session.user.email ?? "—";

  const email = record?.email ?? session.user.email ?? "—";
  const timezone = "UTC";
  const role = "Operator";

  const fields = [
    { label: "Display name", value: displayName },
    { label: "Workspace role", value: role },
    { label: "Email", value: email },
    { label: "Time zone", value: timezone },
    { label: "Account created", value: formatDate(record?.createdAt) },
    { label: "Last synced", value: formatDate(record?.updatedAt) },
  ];

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
