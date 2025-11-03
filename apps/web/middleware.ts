import { authMiddleware } from "@clerk/nextjs";

export default authMiddleware({
  publicRoutes: [
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
  ],
  ignoredRoutes: ["/api/webhooks/clerk"],
});

export const config = {
  matcher: [
    "/((?!_next|_static|_vercel|.*\\..*).*)",
  ],
};
