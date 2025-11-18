"use client";

import { useInView, useMotionValue, useSpring } from "motion/react";
import { useCallback, useEffect, useRef } from "react";

type CountUpDirection = "up" | "down";

type CountUpProps = {
	to: number;
	from?: number;
	direction?: CountUpDirection;
	delay?: number;
	duration?: number;
	className?: string;
	startWhen?: boolean;
	separator?: string;
	suffix?: string;
	onStart?: () => void;
	onEnd?: () => void;
};

function getDecimalPlaces(value: number) {
	const stringValue = value.toString();

	if (!stringValue.includes(".")) {
		return 0;
	}

	const decimals = stringValue.split(".")[1] ?? "";

	return Number.parseInt(decimals, 10) !== 0 ? decimals.length : 0;
}

export function CountUp({
	to,
	from = 0,
	direction = "up",
	delay = 0,
	duration = 2,
	className,
	startWhen = true,
	separator = "",
	suffix = "",
	onStart,
	onEnd,
}: CountUpProps) {
	const ref = useRef<HTMLSpanElement>(null);
	const motionValue = useMotionValue(direction === "down" ? to : from);

	const damping = 20 + 40 * (1 / duration);
	const stiffness = 100 * (1 / duration);

	const springValue = useSpring(motionValue, {
		damping,
		stiffness,
	});

	const isInView = useInView(ref, { once: true, margin: "0px" });

	const maxDecimals = Math.max(getDecimalPlaces(from), getDecimalPlaces(to));

	const formatValue = useCallback(
		(latest: number) => {
			const hasDecimals = maxDecimals > 0;
			const grouped = !!separator;

			const formattedNumber = new Intl.NumberFormat("en-US", {
				useGrouping: grouped,
				minimumFractionDigits: hasDecimals ? maxDecimals : 0,
				maximumFractionDigits: hasDecimals ? maxDecimals : 0,
			}).format(latest);

			const numberWithSeparator = grouped
				? formattedNumber.replace(/,/g, separator)
				: formattedNumber;

			return suffix ? `${numberWithSeparator}${suffix}` : numberWithSeparator;
		},
		[maxDecimals, separator, suffix],
	);

	useEffect(() => {
		if (ref.current) {
			ref.current.textContent = formatValue(direction === "down" ? to : from);
		}
	}, [from, to, direction, formatValue]);

	useEffect(() => {
		if (!ref.current || !isInView || !startWhen) {
			return;
		}

		if (typeof onStart === "function") {
			onStart();
		}

		const initialTimeout = window.setTimeout(() => {
			motionValue.set(direction === "down" ? from : to);
		}, delay * 1000);

		const completionTimeout = window.setTimeout(
			() => {
				if (typeof onEnd === "function") {
					onEnd();
				}
			},
			(delay + duration) * 1000,
		);

		return () => {
			window.clearTimeout(initialTimeout);
			window.clearTimeout(completionTimeout);
		};
	}, [
		delay,
		direction,
		duration,
		from,
		isInView,
		motionValue,
		onEnd,
		onStart,
		startWhen,
		to,
	]);

	useEffect(() => {
		const unsubscribe = springValue.on("change", (latest) => {
			if (ref.current) {
				ref.current.textContent = formatValue(latest);
			}
		});

		return () => {
			unsubscribe();
		};
	}, [springValue, formatValue]);

	return <span className={className} ref={ref} />;
}

export default CountUp;
