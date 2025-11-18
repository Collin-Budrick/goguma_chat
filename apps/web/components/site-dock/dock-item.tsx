import { useEffect, useRef, useState } from "react";
import {
	AnimatePresence,
	motion,
	useMotionValue,
	useSpring,
	useTransform,
	type MotionValue,
} from "framer-motion";

import { isLinkItem, type DockNavItem } from "./navigation";
import { type ContrastTheme } from "./use-dock-contrast";

type SpringConfig = {
	mass: number;
	stiffness: number;
	damping: number;
};

export function DockItem({
	item,
	onSelect,
	mouseX,
	spring,
	baseSize,
	magnifiedSize,
	range,
	active,
	tooltipsEnabled,
	theme,
}: {
	item: DockNavItem;
	onSelect: (item: DockNavItem) => void;
	mouseX: MotionValue<number>;
	spring: SpringConfig;
	baseSize: number;
	magnifiedSize: number;
	range: number;
	active: boolean;
	tooltipsEnabled: boolean;
	theme: ContrastTheme;
}) {
	const ref = useRef<HTMLButtonElement | null>(null);
	const hover = useMotionValue<number>(0);
	const [isHovered, setIsHovered] = useState(() => hover.get() === 1);

	useEffect(() => {
		const unsubscribe = hover.on("change", (latest) => {
			setIsHovered(latest === 1);
		});
		return () => unsubscribe();
	}, [hover]);

	const showLabel = tooltipsEnabled && isHovered;

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
	const isLightTheme = theme === "light";
	const indicatorValue = item.indicator;
	const showIndicator =
		typeof indicatorValue === "number"
			? indicatorValue > 0
			: Boolean(indicatorValue);
	const buttonStateClasses = active
		? isLightTheme
			? "border-slate-300 bg-white/90"
			: "border-white/40 bg-white/25"
		: isLightTheme
			? "border-slate-200 bg-white/70 hover:border-slate-300 hover:bg-white/80"
			: "border-white/15 bg-white/10 hover:border-white/30 hover:bg-white/18";

	return (
		<motion.button
			ref={ref}
			style={{ width: size, height: size, y: lift }}
			onMouseEnter={() => hover.set(1)}
			onMouseLeave={() => hover.set(0)}
			onFocus={() => hover.set(1)}
			onBlur={() => hover.set(0)}
			onClick={() => onSelect(item)}
			data-contrast-theme={theme}
			data-state={active ? "active" : undefined}
			className={`dock-button relative isolate flex items-center justify-center rounded-2xl border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 ${isLightTheme ? "focus-visible:ring-slate-900/30 focus-visible:ring-offset-white" : "focus-visible:ring-white/70 focus-visible:ring-offset-black"} ${buttonStateClasses}`}
			type="button"
			aria-label={item.label}
			aria-current={active ? "page" : undefined}
			aria-pressed={!isLinkItem(item) ? active : undefined}
		>
			<Icon
				className={`h-5 w-5 ${
					active
						? isLightTheme
							? "text-slate-900"
							: "text-white"
						: isLightTheme
							? "text-slate-600"
							: "text-white/80"
				}`}
				aria-hidden
			/>
			{showIndicator ? <span className="dock-indicator" aria-hidden /> : null}
			<AnimatePresence>
				{showLabel && (
					<motion.span
						initial={{ opacity: 0, y: 0 }}
						animate={{ opacity: 1, y: -12 }}
						exit={{ opacity: 0, y: 0 }}
						transition={{ duration: 0.18 }}
						className={`dock-tooltip absolute -top-3 left-1/2 z-20 -translate-x-1/2 whitespace-nowrap rounded-md border px-2 py-1 text-[10px] font-medium uppercase tracking-[0.2em] pointer-events-none ${
							isLightTheme
								? "border-slate-200 bg-white text-slate-800 shadow-[0_12px_24px_rgba(148,163,184,0.32)]"
								: "border-white/20 bg-black/80 text-white shadow-[0_12px_24px_rgba(0,0,0,0.5)]"
						}`}
						role="tooltip"
					>
						{item.label}
					</motion.span>
				)}
			</AnimatePresence>
		</motion.button>
	);
}
