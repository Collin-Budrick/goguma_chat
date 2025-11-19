import type { CSSProperties, ReactNode } from "react";

import { cn } from "@/lib/utils";

const DEFAULT_COLORS = ["#7c3aed", "#f6c232", "#7c3aed"];

type GradientStyle = CSSProperties & {
	"--gradient-duration"?: string;
};

interface GradientTextProps {
	children: ReactNode;
	className?: string;
	colors?: string[];
	animationSpeed?: number;
	showBorder?: boolean;
}

export default function GradientText({
	children,
	className,
	colors = DEFAULT_COLORS,
	animationSpeed = 8,
	showBorder = false,
}: GradientTextProps) {
	const gradientStyle: GradientStyle = {
		backgroundImage: `linear-gradient(90deg, ${colors.join(", ")})`,
		backgroundClip: "text",
		WebkitBackgroundClip: "text",
		backgroundSize: "300% 100%",
		"--gradient-duration": `${animationSpeed}s`,
	};

	return (
		<span
			className={cn(
				"relative inline-block",
				showBorder && "rounded-[1.25rem] border border-white/10 p-[2px]",
				className,
			)}
		>
			{showBorder && (
				<span
					aria-hidden
					className="pointer-events-none absolute inset-[2px] rounded-[1rem] bg-black/80"
				/>
			)}
			<span
				className={cn(
					"gradient-animated-text relative block text-transparent",
					showBorder && "rounded-[1rem] px-4 py-2",
				)}
				style={gradientStyle}
			>
				{children}
			</span>
		</span>
	);
}
