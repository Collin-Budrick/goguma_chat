import type { PropsWithChildren } from "react";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import UserMenu from "@/components/user-menu";
import WorkspaceNav from "@/components/workspace-nav";

export const metadata = {
  title: "Workspace | Goguma Chat",
};

export const dynamic = "force-static";

export default function AppLayout({ children }: PropsWithChildren) {
  return (
    <Suspense fallback={<AppLayoutShell />}>
      <ProtectedApp>{children}</ProtectedApp>
    </Suspense>
  );
}

function AppLayoutShell() {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl flex-col gap-10 px-6 py-16 pb-32">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="space-y-3">
          <div className="h-3 w-48 rounded-full bg-white/10" />
          <div className="h-8 w-72 rounded-full bg-white/10" />
        </div>
        <div className="flex items-center gap-4">
          <div className="h-10 w-32 rounded-full bg-white/10" />
          <div className="h-10 w-36 rounded-full bg-white/10" />
        </div>
      </header>
      <div className="flex-1 rounded-3xl border border-white/10 bg-white/[0.02]" />
    </div>
  );
}

async function ProtectedApp({ children }: PropsWithChildren) {
  const session = await auth();

  if (!session?.user) {
    redirect("/login");
  }

  return (
    <div className="mx-auto flex min-h-[calc(100vh-6rem)] w-full max-w-6xl flex-col gap-10 px-6 py-16 pb-32">
      <header className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.35em] text-white/50">
            Goguma Chat Workspace
          </p>
          <h1 className="text-3xl font-semibold tracking-tight text-white">
            Sweet Systems CX
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <WorkspaceNav />
          <UserMenu user={session.user} />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
