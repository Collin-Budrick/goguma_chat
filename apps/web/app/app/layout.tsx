import type { PropsWithChildren } from "react";
import { UserButton } from "@clerk/nextjs";
import WorkspaceNav from "../../components/workspace-nav";

export const metadata = {
  title: "Workspace | Goguma Chat",
};

export default function AppLayout({ children }: PropsWithChildren) {
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
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: {
                avatarBox: "h-10 w-10 border border-white/20",
              },
            }}
          />
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
