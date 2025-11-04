import type { PropsWithChildren } from "react";

export const dynamic = "force-static";

export default function WorkspaceLayout({ children }: PropsWithChildren) {
  return <>{children}</>;
}
