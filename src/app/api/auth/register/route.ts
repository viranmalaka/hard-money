import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import {
  hashPassword,
  createSessionToken,
  seedDefaultCategoriesForUser,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { rateLimit } from "@/lib/rate-limit";

const RegisterSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  email: z.string().email("Valid email is required").max(254),
  password: z
    .string()
    .min(6, "Password must be at least 6 characters")
    .max(128),
});

export async function POST(request: NextRequest) {
  const isTestDisabled =
    process.env.E2E_MODE === "1" &&
    (request.headers.get("x-test-disable-registration") === "1" ||
      request.nextUrl.searchParams.get("disabled") === "1");

  if (process.env.ALLOW_REGISTRATION === "false" || isTestDisabled) {
    return NextResponse.json(
      { error: "Registration is closed on this server" },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const ip =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const parsed = RegisterSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Invalid input" },
      { status: 400 },
    );
  }

  const { name, email, password } = parsed.data;
  const normalizedEmail = email.toLowerCase().trim();
  const ipLimit = rateLimit(`register:ip:${ip}`, 5, 60 * 60_000);
  const emailLimit = rateLimit(
    `register:email:${normalizedEmail}`,
    5,
    60 * 60_000,
  );
  const retryAfter = Math.max(ipLimit.retryAfter, emailLimit.retryAfter);
  if (!ipLimit.allowed || !emailLimit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts" },
      { status: 429, headers: { "Retry-After": String(retryAfter) } },
    );
  }

  const existing = await prisma.user.findUnique({
    where: { email: normalizedEmail },
  });

  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 },
    );
  }

  const passwordHash = await hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      defaultCurrency: "LKR",
      timezone: "Asia/Colombo",
    },
  });

  // Create default household
  const household = await prisma.household.create({
    data: {
      name: `${user.name}'s Household`,
      ownerId: user.id,
    },
  });

  await prisma.householdMember.create({
    data: {
      householdId: household.id,
      userId: user.id,
      role: "OWNER",
    },
  });

  // Seed default categories
  await seedDefaultCategoriesForUser(user.id);

  // Generate session token
  const token = await createSessionToken({
    userId: user.id,
    email: user.email,
    name: user.name,
  });

  const response = NextResponse.json(
    {
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        timezone: user.timezone,
        defaultCurrency: user.defaultCurrency,
      },
    },
    { status: 201 },
  );

  response.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}
