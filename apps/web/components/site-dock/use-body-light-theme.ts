import { useEffect } from "react";

export function useBodyLightTheme(enabled: boolean) {
	useEffect(() => {
		if (typeof document === "undefined") return;
		if (enabled) {
			document.body.classList.add("theme-light");
		} else {
			document.body.classList.remove("theme-light");
		}

		return () => {
			document.body.classList.remove("theme-light");
		};
	}, [enabled]);
}
