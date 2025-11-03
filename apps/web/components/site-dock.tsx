"use client";

import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AnimatePresence,
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  type MotionValue,
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

type DockLinkItem = {
  type: "link";
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  match?: (path: string) => boolean;
};

type DockActionItem = {
  type: "action";
  id: "preferences";
  label: string;
  icon: ComponentType<{ className?: string }>;
};

type DockNavItem = DockLinkItem | DockActionItem;

function isLinkItem(item: DockNavItem): item is DockLinkItem {
  return item.type === "link";
}

const marketingDock: DockNavItem[] = [
  { type: "link", href: "/", label: "Home", icon: Home, match: (path) => path === "/" },
  { type: "link", href: "/capture", label: "Capture", icon: Palette },
  { type: "link", href: "/integrations", label: "Integrations", icon: Layers },
  { type: "link", href: "/about", label: "About", icon: Info },
  { type: "link", href: "/contact", label: "Contact", icon: Mail },
  {
    type: "link",
    href: "/login",
    label: "Account",
    icon: CircleUserRound,
    match: (path) => path.startsWith("/login") || path.startsWith("/signup"),
  },
  {
    type: "action",
    id: "preferences",
    label: "Display",
    icon: Settings2,
  },
];

const appDock: DockNavItem[] = [
  { type: "link", href: "/app/dashboard", label: "Overview", icon: LayoutDashboard },
  { type: "link", href: "/app/chat", label: "Chats", icon: MessageSquare },
  {
    type: "action",
    id: "preferences",
    label: "Display",
    icon: Settings2,
  },
  { type: "link", href: "/profile", label: "Profile", icon: CircleUserRound },
];

const adminDock: DockNavItem[] = [
  { type: "link", href: "/admin", label: "Console", icon: LayoutDashboard },
  { type: "link", href: "/admin/push", label: "Broadcasts", icon: Megaphone },
  { type: "link", href: "/admin/users", label: "Roster", icon: Layers },
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
  mouseX: MotionValue<number>;
  spring: typeof springConfig;
  baseSize: number;
  magnifiedSize: number;
  range: number;
  active: boolean;
}) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const hover = useMotionValue<number>(0);
  const [showLabel, setShowLabel] = useState(false);

  useEffect(() => {
    const unsubscribe = hover.on("change", (latest) => {
      setShowLabel(latest === 1);
    });
    return () => unsubscribe();
  }, [hover]);

  const distance = useTransform(mouseX, (value: number) => {
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
      className={`relative isolate flex items-center justify-center rounded-2xl border text-white outline-none transition-colors focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-black ${active
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
            className="-top-3 left-1/2 z-20 absolute bg-black/80 shadow-[0_12px_24px_rgba(0,0,0,0.5)] px-2 py-1 border border-white/20 rounded-md font-medium text-[10px] text-white uppercase tracking-[0.2em] -translate-x-1/2 pointer-events-none"
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

  const mouseX = useMotionValue<number>(Infinity);
  const hover = useMotionValue<number>(0);

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
          className="bottom-6 z-[80] fixed inset-x-0 flex justify-center px-4 pointer-events-none"
        >
          <motion.div
            style={{ height }}
            className="flex justify-center items-end w-full max-w-3xl pointer-events-auto"
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
              className="before:absolute relative before:inset-px flex items-end gap-4 bg-white/12 before:bg-gradient-to-br before:from-white/12 before:to-white/4 before:opacity-80 shadow-[0_26px_70px_rgba(0,0,0,0.45)] backdrop-blur-2xl px-4 py-4 border border-white/15 rounded-[32px] before:rounded-[30px] before:content-[''] before:pointer-events-none"
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
