import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

const DEV_AUTH_SECRET = "insecure-dev-auth-secret-minimum-32-characters-long";
const AUTH_SECRET = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : DEV_AUTH_SECRET);
if (process.env.NODE_ENV === "production" && (new TextEncoder().encode(AUTH_SECRET).length < 32 || AUTH_SECRET === DEV_AUTH_SECRET)) {
  throw new Error("AUTH_SECRET must be configured with at least 32 bytes in production");
}
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET);
const SESSION_COOKIE_NAME = "hardmoney_session";

const PUBLIC_PATHS = [
  "/login",
  "/register",
  "/offline",
  "/api/auth",
  "/api/health",
  "/api/test",
  "/api/v1/cron",
  "/api/v1/webhooks",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static files, Next.js internals, and images
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/test")
  ) {
    return NextResponse.next();
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  let isAuthenticated = false;

  if (token) {
    try {
      await jwtVerify(token, SECRET_KEY);
      isAuthenticated = true;
    } catch {
      isAuthenticated = false;
    }
  }

  const isPublicPath = PUBLIC_PATHS.some(
    (p) => pathname === p || pathname.startsWith(p + "/"),
  );

  // Unauthenticated user trying to access protected route
  if (!isAuthenticated && !isPublicPath) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const loginUrl = new URL("/login", request.url);
    if (pathname !== "/") {
      loginUrl.searchParams.set("callbackUrl", pathname);
    }
    return NextResponse.redirect(loginUrl);
  }

  // Authenticated user trying to access login/register
  if (isAuthenticated && (pathname === "/login" || pathname === "/register")) {
    const callbackUrl = request.nextUrl.searchParams.get("callbackUrl");
    const redirectUrl =
      callbackUrl && /^\/(?![\/\\])/.test(callbackUrl) ? callbackUrl : "/";
    return NextResponse.redirect(new URL(redirectUrl, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     */
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
