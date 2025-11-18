"use client";

import { motion } from "framer-motion";
import type { PropsWithChildren, ReactNode } from "react";

type SimplePageProps = PropsWithChildren<{
	title: ReactNode;
	description?: ReactNode;
}>;

export default function SimplePage({
	title,
	description,
	children,
}: SimplePageProps) {
	return (
		<motion.main
			initial={{ opacity: 0, y: 36 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ duration: 0.6, ease: [0.22, 0.9, 0.37, 1] }}
			className="mx-auto min-h-screen w-full max-w-3xl px-6 py-24 pb-40 text-white"
		>
			<header className="mb-10 space-y-3">
				<h1 className="text-3xl font-semibold tracking-tight">{title}</h1>
				{description ? (
					<p className="mt-3 text-base text-white/60">{description}</p>
				) : null}
			</header>
			<div className="space-y-6 text-sm text-white/70">{children}</div>
		</motion.main>
	);
}
