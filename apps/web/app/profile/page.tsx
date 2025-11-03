import { currentUser } from "@clerk/nextjs/server";
import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { db } from "@/db";
import { users } from "@/db/schema";
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
  const user = await currentUser();

  if (!user) {
    redirect("/login");
  }

  const [record] = await db
    .select()
    .from(users)
    .where(eq(users.id, user.id))
    .limit(1);

  const displayName =
    record?.firstName || record?.lastName
      ? [record.firstName, record.lastName].filter(Boolean).join(" ")
      : user.fullName ?? "—";

  const email = record?.email ?? user.primaryEmailAddress?.emailAddress ?? "—";
  const timezone = user.timezone ?? "UTC";
  const role = (user.publicMetadata?.role as string | undefined) ?? "Operator";

  const fields = [
    { label: "Display name", value: displayName },
    { label: "Workspace role", value: role },
    { label: "Email", value: email },
    { label: "Time zone", value: timezone },
    { label: "Account created", value: formatDate(record?.createdAt ?? user.createdAt) },
    { label: "Last synced", value: formatDate(record?.updatedAt ?? user.updatedAt) },
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
