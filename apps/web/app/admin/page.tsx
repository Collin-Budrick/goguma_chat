export const metadata = {
  title: "Admin Console | Goguma Chat",
};

export default function AdminHomePage() {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-16 pb-32 text-white">
      <h1 className="text-3xl font-semibold tracking-tight">Admin console</h1>
      <p className="mt-4 text-sm text-white/60">
        Choose a management area from the navigation to review system health,
        send announcements, or manage operator access.
      </p>
    </main>
  );
}
