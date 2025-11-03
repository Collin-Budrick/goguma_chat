"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/chat", label: "Chat" },
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/settings", label: "Settings" },
];

export default function WorkspaceNav() {
  const pathname = usePathname();
  return (
    <nav className="flex items-center gap-3">
      {LINKS.map((item) => {
        const active = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`rounded-full px-3 py-1 text-xs uppercase tracking-[0.25em] transition ${
              active
                ? "bg-white text-black"
                : "border border-white/20 text-white/60 hover:text-white"
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
