import type { PropsWithChildren } from "react";

export const dynamic = "force-dynamic";

export default function WorkspaceLayout({ children }: PropsWithChildren) {
  return <>{children}</>;
}
