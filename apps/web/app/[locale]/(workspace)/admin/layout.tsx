import type { PropsWithChildren } from "react";
import AdminGate from "@/components/admin-gate";

export default function AdminLayout({ children }: PropsWithChildren) {
  return <AdminGate>{children}</AdminGate>;
}
