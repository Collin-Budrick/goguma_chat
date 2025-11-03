import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

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

function isMatch(pathname: string, patterns: RegExp[]) {
  return patterns.some((pattern) => pattern.test(pathname));
}

export default async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
  const isAuthenticated = Boolean(token);

  if (isMatch(pathname, PUBLIC_ROUTE_PATTERNS)) {
    if (isAuthenticated && isMatch(pathname, AUTH_ROUTE_PATTERNS)) {
      return NextResponse.redirect(new URL("/app/dashboard", req.nextUrl.origin));
    }
    return NextResponse.next();
  }

  if (!isAuthenticated) {
    const signInUrl = new URL("/login", req.nextUrl.origin);
    signInUrl.searchParams.set("callbackUrl", req.nextUrl.href);
    return NextResponse.redirect(signInUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next|_static|_vercel|.*\\..*).*)"],
};
