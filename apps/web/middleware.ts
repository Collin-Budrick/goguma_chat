import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/",
  "/about(.*)",
  "/capture(.*)",
  "/contact(.*)",
  "/integrations(.*)",
  "/login(.*)",
  "/privacy(.*)",
  "/signup(.*)",
  "/status(.*)",
  "/support(.*)",
  "/terms(.*)",
  "/api/webhooks/clerk",
]);

const isIgnoredRoute = createRouteMatcher(["/api/webhooks/clerk"]);

export default clerkMiddleware((auth, req) => {
  if (isIgnoredRoute(req) || isPublicRoute(req)) {
    return;
  }

  return auth.protect();
});

export const config = {
  matcher: [
    "/((?!_next|_static|_vercel|.*\\..*).*)",
  ],
};
