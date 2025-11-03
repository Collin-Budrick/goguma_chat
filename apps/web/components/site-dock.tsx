"use client";

import type { ComponentType } from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
} from "framer-motion";
import {
  CircleUserRound,
  Home,
  Info,
  Layers,
  LayoutDashboard,
  Mail,
  Megaphone,
  MessageSquare,
  Palette,
  Settings2,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useTransitionDirection } from "./transition-context";

type DockNavItem = {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
};

const marketingDock: DockNavItem[] = [
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

const appDock: DockNavItem[] = [
  { href: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/app/chat", label: "Chats", icon: MessageSquare },
  { href: "/app/settings", label: "Settings", icon: Settings2 },
  { href: "/profile", label: "Profile", icon: CircleUserRound },
];

const adminDock: DockNavItem[] = [
  { href: "/admin", label: "Console", icon: LayoutDashboard },
  { href: "/admin/push", label: "Broadcasts", icon: Megaphone },
  { href: "/admin/users", label: "Roster", icon: Layers },
];

const springConfig = { mass: 0.15, stiffness: 180, damping: 16 };

function resolveDock(pathname: string): DockNavItem[] {
  if (pathname.startsWith("/admin")) return adminDock;
  if (pathname.startsWith("/app") || pathname.startsWith("/profile")) {
    return appDock;
  }
  return marketingDock;
}

function DockItem({
  item,
  onSelect,
  mouseX,
  spring,
  baseSize,
  magnifiedSize,
  range,
  active,
}: {
  item: DockNavItem;
  onSelect: (href: string) => void;
  mouseX: ReturnType<typeof useMotionValue>;
  spring: typeof springConfig;
  baseSize: number;
  magnifiedSize: number;
  range: number;
  active: boolean;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const hover = useMotionValue(0);
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    const unsubscribe = hover.on("change", (latest) => {
      setShowLabel(latest === 1);
    });
    return () => unsubscribe();
  }, [hover]);

  const distance = useTransform(mouseX, (value) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return Infinity;
    return value - rect.left - rect.width / 2;
  });

  const targetSize = useTransform(
    distance,
    [-range, 0, range],
    [baseSize, magnifiedSize, baseSize],
  );

  const size = useSpring(targetSize, spring);
  const lift = useSpring(
    useTransform(targetSize, (val) => -Math.max(0, val - baseSize) / 2),
    spring,
  );

  const Icon = item.icon;

  return (
    <motion.button
      ref={ref}
      style={{ width: size, height: size, y: lift }}
      onMouseEnter={() => hover.set(1)}
      onMouseLeave={() => hover.set(0)}
      onFocus={() => hover.set(1)}
      onBlur={() => hover.set(0)}
      onClick={() => onSelect(item.href)}
      className={`relative isolate flex items-center justify-center rounded-2xl border text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${
        active
          ? "border-white/40 bg-white/25"
          : "border-white/15 bg-white/10 hover:border-white/30 hover:bg-white/18"
      }`}
      type="button"
      aria-label={item.label}
      aria-current={active ? "page" : undefined}
    >
      <Icon
        className={`h-5 w-5 ${active ? "text-white" : "text-white/80"}`}
        aria-hidden
      />
      <AnimatePresence>
        {showLabel && (
          <motion.span
            initial={{ opacity: 0, y: 0 }}
            animate={{ opacity: 1, y: -12 }}
            exit={{ opacity: 0, y: 0 }}
            transition={{ duration: 0.18 }}
            className="pointer-events-none absolute -top-3 left-1/2 z-20 -translate-x-1/2 rounded-md border border-white/20 bg-black/80 px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] text-white shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
            role="tooltip"
          >
            {item.label}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.button>
  );
}

export default function SiteDock() {
  const pathname = usePathname();
  const router = useRouter();
  const dockItems = useMemo(() => resolveDock(pathname), [pathname]);
  const [scrolled, setScrolled] = useState(false);
  const [mounted, setMounted] = useState(false);
  const { setDirection } = useTransitionDirection();

  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  const mouseX = useMotionValue(Infinity);
  const hover = useMotionValue(0);

  const baseSize = 52;
  const magnifiedSize = 78;
  const range = 180;
  const panelHeight = 74;
  const dockHeight = 110;

  const maxHeight = useMemo(
    () => Math.max(dockHeight, magnifiedSize + magnifiedSize / 2 + 12),
    [dockHeight, magnifiedSize],
  );
  const rowHeight = useTransform(hover, [0, 1], [panelHeight, maxHeight]);
  const height = useSpring(rowHeight, springConfig);

  const stripTrailingSlash = (path: string) => {
    if (path === "/") return "/";
    return path.replace(/\/$/, "");
  };

  const indexForPath = (items: DockNavItem[], path: string) => {
    const normalized = stripTrailingSlash(path);
    return items.findIndex((item) => {
      if (item.match) {
        return item.match(normalized);
      }
      const target = stripTrailingSlash(item.href);
      if (target === "/") return normalized === "/";
      return normalized.startsWith(target);
    });
  };

  const currentIndex = indexForPath(dockItems, pathname);

  const handleSelect = (href: string) => {
    const targetIndex = indexForPath(dockItems, href);
    let dir: 1 | -1 = 1;

    if (targetIndex !== -1 && currentIndex !== -1) {
      dir = targetIndex >= currentIndex ? 1 : -1;
    }

    setDirection(dir);
    router.push(href);
  };

  const activeMatcher = (item: DockNavItem) => {
    const matcher = item.match ?? ((path: string) => path.startsWith(item.href));
    return matcher(pathname);
  };

  return (
    <AnimatePresence>
      {mounted && (
        <motion.div
          initial={{ opacity: 0, y: 36, scale: 0.94 }}
          animate={{
            opacity: 1,
            y: scrolled ? 0 : 6,
            scale: scrolled ? 0.98 : 1,
          }}
          exit={{ opacity: 0, y: 48, scale: 0.9 }}
          transition={{ type: "spring", stiffness: 220, damping: 26 }}
          className="pointer-events-none fixed inset-x-0 bottom-6 z-[80] flex justify-center px-4"
        >
          <motion.div
            style={{ height }}
            className="pointer-events-auto flex w-full max-w-3xl items-end justify-center"
          >
            <motion.div
              onMouseMove={(event) => {
                hover.set(1);
                mouseX.set(event.pageX);
              }}
              onMouseLeave={() => {
                hover.set(0);
                mouseX.set(Infinity);
              }}
              onMouseEnter={() => hover.set(1)}
              className="relative flex items-end gap-4 rounded-[32px] border border-white/15 bg-white/12 px-4 py-4 shadow-[0_26px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl before:pointer-events-none before:absolute before:inset-px before:rounded-[30px] before:bg-gradient-to-br before:from-white/12 before:to-white/4 before:opacity-80 before:content-['']"
              style={{ height: panelHeight }}
              role="toolbar"
              aria-label="Application dock"
            >
              {dockItems.map((item) => (
                <DockItem
                  key={item.href}
                  item={item}
                  onSelect={handleSelect}
                  mouseX={mouseX}
                  spring={springConfig}
                  baseSize={baseSize}
                  magnifiedSize={magnifiedSize}
                  range={range}
                  active={activeMatcher(item)}
                />
              ))}
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
