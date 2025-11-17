import type { PropsWithChildren } from "react";
import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

type ProtectedAppProps = PropsWithChildren<{
  params: Promise<{ locale: string }>;
}>;

export default async function ProtectedApp({ children, params }: ProtectedAppProps) {
  const { locale } = await params;
  const session = await auth();

  if (!session?.user) {
    redirect(`/${locale}/login`);
  }

  return (
    <div className="mx-auto flex h-[calc(100vh-6rem)] max-h-[calc(100vh-6rem)] w-full max-w-6xl flex-col gap-10 px-6 py-16 pb-32 overflow-hidden">
      <div className="flex flex-1 min-h-0 h-full overflow-hidden">{children}</div>
    </div>
  );
}
