import type { ReactNode } from "react";

import "./globals.css";

import { ServiceWorkerClient } from "@/components/service-worker-client";
import { routing } from "@/i18n/routing";

export default function RootLayout({ children }: { children: ReactNode }) {
	return (
		<html
			lang={routing.defaultLocale}
			suppressHydrationWarning
			data-locale={routing.defaultLocale}
		>
			<body className="min-h-screen font-sans antialiased">
				<ServiceWorkerClient />
				{children}
			</body>
		</html>
	);
}
