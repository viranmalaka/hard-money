import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const AUTH_SECRET = process.env.AUTH_SECRET || "insecure-dev-auth-secret-minimum-32-characters-long";
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET.padEnd(32, "0"));
export const SESSION_COOKIE_NAME = "hardmoney_session";

export interface SessionPayload {
  userId: string;
  email: string;
  name: string;
}

export async function hashPassword(password: string): Promise<string> {
  return hash(password, {
    memoryCost: 19456,
    timeCost: 2,
    outputLen: 32,
    parallelism: 1,
  });
}

export async function verifyPassword(hashStr: string, password: string): Promise<boolean> {
  try {
    return await verify(hashStr, password);
  } catch {
    return false;
  }
}

export async function createSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    return {
      userId: payload.userId as string,
      email: payload.email as string,
      name: payload.name as string,
    };
  } catch {
    return null;
  }
}

export async function getSessionUser(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}

export const DEFAULT_SYSTEM_CATEGORIES = [
  { name: "Groceries", icon: "ShoppingCart", color: "#2B8A3E" },
  { name: "Dining", icon: "Utensils", color: "#E8590C" },
  { name: "Fuel & Transport", icon: "Fuel", color: "#1971C2" },
  { name: "Utilities & Bills", icon: "Zap", color: "#F59F00" },
  { name: "Healthcare", icon: "HeartPulse", color: "#D6336C" },
  { name: "Shopping", icon: "ShoppingBag", color: "#845EF7" },
  { name: "Bank Fees", icon: "AlertCircle", color: "#495057" },
  { name: "Cash Withdrawal", icon: "ArrowDownCircle", color: "#495057" },
  { name: "Salary", icon: "Wallet", color: "#0CA678" },
  { name: "Investment Yield", icon: "TrendingUp", color: "#2F9E44" },
  { name: "Loan Principal", icon: "CreditCard", color: "#3B5BDB" },
  { name: "Balance Calibration", icon: "Sliders", color: "#868E96" },
];

export async function seedDefaultCategoriesForUser(userId: string) {
  const categories = DEFAULT_SYSTEM_CATEGORIES.map((cat) => ({
    userId,
    name: cat.name,
    icon: cat.icon,
    color: cat.color,
  }));

  await prisma.category.createMany({
    data: categories,
  });
}
