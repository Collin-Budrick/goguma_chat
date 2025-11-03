"use client";

import type { ComponentType } from "react";
import {
  CircleUserRound,
  Home,
  Info,
  Layers,
  LayoutDashboard,
  Megaphone,
  Mail,
  MessageSquare,
  Palette,
  Settings2,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

type DockItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
};

const marketingDock: DockItem[] = [
  { href: "/", label: "Home", icon: Home, match: (path) => path === "/" },
  { href: "/capture", label: "Capture", icon: Palette },
  { href: "/integrations", label: "Integrations", icon: Layers },
  { href: "/about", label: "About", icon: Info },
  { href: "/contact", label: "Contact", icon: Mail },
  {
    href: "/login",
    label: "Account",
    icon: CircleUserRound,
    match: (path) => path.startsWith("/login") || path.startsWith("/signup"),
  },
];

const appDock: DockItem[] = [
  { href: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/app/chat", label: "Chats", icon: MessageSquare },
  { href: "/app/settings", label: "Settings", icon: Settings2 },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

const adminDock: DockItem[] = [
  { href: "/admin", label: "Console", icon: LayoutDashboard },
  { href: "/admin/push", label: "Broadcasts", icon: Megaphone },
  { href: "/admin/users", label: "Roster", icon: Layers },
];

function resolveDock(pathname: string): DockItem[] {
  if (pathname.startsWith("/admin")) return adminDock;
  if (pathname.startsWith("/app") || pathname.startsWith("/profile")) {
    return appDock;
  }
  return marketingDock;
}

export default function SiteDock() {
  const pathname = usePathname();
  const dockItems = useMemo(() => resolveDock(pathname), [pathname]);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 24);
    };
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const activeMatcher = (item: DockItem) => {
    const match = item.match ?? ((path: string) => path.startsWith(item.href));
    if (item.href === "/") {
      return match(pathname);
    }
    return match(pathname);
  };

  return (
    <AnimatePresence>
      {mounted && (
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.92 }}
          animate={{
            opacity: 1,
            y: scrolled ? 0 : 6,
            scale: scrolled ? 0.98 : 1,
          }}
          exit={{ opacity: 0, y: 40, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 220, damping: 24 }}
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[60] flex justify-center px-4"
        >
          <nav className="pointer-events-auto flex w-full max-w-2xl items-center justify-between rounded-[28px] border border-white/10 bg-white/10 px-3 py-2 backdrop-blur-2xl shadow-[0_24px_60px_rgba(0,0,0,0.4)]">
            {dockItems.map((item) => {
              const Icon = item.icon;
              const active = activeMatcher(item);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className="relative flex flex-1 flex-col items-center gap-1 rounded-[22px] px-2 py-2 text-xs font-medium text-white/60 transition-colors"
                >
                  {active && (
                    <motion.span
                      layoutId="dock-active"
                      className="absolute inset-0 rounded-[22px] bg-white/20"
                      transition={{ type: "spring", stiffness: 320, damping: 28 }}
                    />
                  )}
                  <Icon
                    className={`relative h-5 w-5 ${active ? "text-white" : "text-white/70"}`}
                  />
                  <span className={`relative ${active ? "text-white" : ""}`}>
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </nav>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
