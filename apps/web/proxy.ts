import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import type { JWT } from "next-auth/jwt";
import { getToken } from "next-auth/jwt";
import createMiddleware from "next-intl/middleware";

import { type Locale, routing } from "./i18n/routing";

const PUBLIC_ROUTE_PATTERNS = [
	/^\/$/,
	/^\/about(\/.*)?$/,
	/^\/capture(\/.*)?$/,
	/^\/contact(\/.*)?$/,
	/^\/integrations(\/.*)?$/,
	/^\/login(\/.*)?$/,
	/^\/privacy(\/.*)?$/,
	/^\/signup(\/.*)?$/,
	/^\/status(\/.*)?$/,
	/^\/support(\/.*)?$/,
	/^\/terms(\/.*)?$/,
	/^\/api\/auth(\/.*)?$/,
];

const AUTH_ROUTE_PATTERNS = [/^\/login(\/.*)?$/, /^\/signup(\/.*)?$/];

const intlMiddleware = createMiddleware(routing);

const NEXTAUTH_SECRET =
	process.env.NEXTAUTH_SECRET ?? "goguma-development-secret";
const SESSION_COOKIE_NAMES = [
	"next-auth.session-token",
	"__Secure-next-auth.session-token",
	"__Host-next-auth.session-token",
];
const SESSION_COOKIE_REGEX = /(?:__Secure-|__Host-)?next-auth\.session-token=/;

function getLocaleFromPathname(pathname: string): {
	locale: Locale;
	pathname: string;
} {
	const segments = pathname.split("/").filter(Boolean);
	const potentialLocale = segments[0] as Locale | undefined;

	if (potentialLocale && routing.locales.includes(potentialLocale)) {
		const remainder = segments.slice(1).join("/");
		return {
			locale: potentialLocale,
			pathname: remainder ? `/${remainder}` : "/",
		};
	}

	return { locale: routing.defaultLocale, pathname };
}

function localizePath(locale: Locale, pathname: string) {
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
	if (
		routing.localePrefix === "as-needed" &&
		locale === routing.defaultLocale
	) {
		return normalizedPath;
	}
	return `/${locale}${normalizedPath}`;
}

function mergeIntlResponse(base: NextResponse, intlResponse: NextResponse) {
	intlResponse.headers.forEach((value, key) => {
		if (key === "set-cookie") {
			base.headers.append(key, value);
			return;
		}

		if (
			key.startsWith("x-next-intl") ||
			key.startsWith("x-middleware") ||
			key === "vary"
		) {
			base.headers.set(key, value);
		}
	});

	return base;
}

function isMatch(pathname: string, patterns: RegExp[]) {
	return patterns.some((pattern) => pattern.test(pathname));
}

export default async function proxy(req: NextRequest) {
	if (req.nextUrl.pathname.startsWith("/api/")) {
		return NextResponse.next();
	}

	const intlResponse = await intlMiddleware(req);

	if (!intlResponse.headers.get("x-middleware-next")) {
		return intlResponse;
	}

	const { locale, pathname } = getLocaleFromPathname(req.nextUrl.pathname);
	let token: JWT | null = null;
	try {
		token = await getToken({ req, secret: NEXTAUTH_SECRET });
	} catch (error) {
		console.warn("Failed to read auth token:", error);
	}
	const cookieHeader = req.headers.get("cookie") ?? "";
	const hasSessionCookie =
		SESSION_COOKIE_NAMES.some((name) =>
			Boolean(req.cookies.get(name)?.value),
		) || SESSION_COOKIE_REGEX.test(cookieHeader);
	const isAuthenticated = Boolean(token) || hasSessionCookie;

	if (isMatch(pathname, PUBLIC_ROUTE_PATTERNS)) {
		if (isAuthenticated && isMatch(pathname, AUTH_ROUTE_PATTERNS)) {
			const target = new URL(
				localizePath(locale, "/app/dashboard"),
				req.nextUrl.origin,
			);
			return mergeIntlResponse(NextResponse.redirect(target), intlResponse);
		}
		return intlResponse;
	}

	if (!isAuthenticated) {
		const signInUrl = new URL(
			localizePath(locale, "/login"),
			req.nextUrl.origin,
		);
		signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
		return mergeIntlResponse(NextResponse.redirect(signInUrl), intlResponse);
	}

	return intlResponse;
}

export const config = {
	matcher: ["/((?!_next|_static|_vercel|.*\\..*).*)"],
};
