"use client";

import { useMemo } from "react";

import { Link, usePathname } from "@/i18n/navigation";
import { routing } from "@/i18n/routing";

const LINKS = [
  { href: "/app/dashboard", label: "Dashboard" },
  { href: "/app/chat", label: "Chat" },
  { href: "/app/contacts", label: "Contacts" },
  { href: "/app/settings", label: "Settings" },
];

const localePattern = new RegExp(
  `^/(?:${routing.locales.join("|")})(?=/|$)`,
);

const normalizePath = (path: string) => {
  const withoutLocale = path.replace(localePattern, "");
  return withoutLocale.length === 0 ? "/" : withoutLocale;
};

export default function WorkspaceNav() {
  const pathname = usePathname();
  const normalizedPath = useMemo(() => normalizePath(pathname), [pathname]);
  return (
    <nav className="flex items-center gap-3">
      {LINKS.map((item) => {
        const active =
          normalizedPath === item.href ||
          normalizedPath.startsWith(`${item.href}/`);
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
