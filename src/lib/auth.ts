import { hash, verify } from "@node-rs/argon2";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { prisma } from "@/lib/prisma";

const DEV_AUTH_SECRET = "insecure-dev-auth-secret-minimum-32-characters-long";
const AUTH_SECRET = process.env.AUTH_SECRET || (process.env.NODE_ENV === "production" ? "" : DEV_AUTH_SECRET);
if (process.env.NODE_ENV === "production" && (Buffer.byteLength(AUTH_SECRET) < 32 || AUTH_SECRET === DEV_AUTH_SECRET)) {
  throw new Error("AUTH_SECRET must be configured with at least 32 bytes in production");
}
const SECRET_KEY = new TextEncoder().encode(AUTH_SECRET);
export const SESSION_COOKIE_NAME = "hardmoney_session";

export interface SessionPayload {
  userId: string;
  id: string;
  email: string;
  name: string;
  sessionVersion?: number;
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

export async function createSessionToken(payload: Omit<SessionPayload, "id"> & { id?: string }): Promise<string> {
  const userId = payload.userId || payload.id!;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  return new SignJWT({ ...payload, userId, id: userId, sessionVersion: user?.sessionVersion ?? 0 })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(SECRET_KEY);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, SECRET_KEY);
    const userId = (payload.userId || payload.id) as string;
    if (!userId) return null;
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
    if (!user || (payload.sessionVersion ?? 0) !== user.sessionVersion) return null;
    return {
      userId,
      id: userId,
      email: payload.email as string,
      name: payload.name as string,
      sessionVersion: user.sessionVersion,
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

export { DEFAULT_SYSTEM_CATEGORIES } from "./categories-data";
import { DEFAULT_SYSTEM_CATEGORIES } from "./categories-data";

export async function seedDefaultCategoriesForUser(userId: string) {
  const { getNextServerSeq } = await import("./server-seq");
  for (const cat of DEFAULT_SYSTEM_CATEGORIES) {
    const nextSeq = await getNextServerSeq();
    await prisma.category.create({
      data: {
        userId,
        name: cat.name,
        icon: cat.icon,
        color: cat.color,
        type: cat.type,
        serverSeq: nextSeq,
      },
    });
  }
}
