import { prisma } from "@/lib/prisma";

type Actor = { userId: string; id?: string };

export async function assertCanWriteAccount(actor: Actor, accountId: string) {
  const account = await prisma.account.findFirst({ where: { id: accountId, deletedAt: null } });
  if (!account) return null;
  if (account.userId === actor.userId) return account;
  if (account.accessScope !== "SHARED_HOUSEHOLD" || !account.householdId) return null;
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: account.householdId, userId: actor.userId } },
  });
  return member && member.role !== "VIEWER" ? account : null;
}

export async function authorizeLoan(actor: Actor, id: string, mode: "read" | "write") {
  const loan = await prisma.loan.findFirst({ where: { id, deletedAt: null } });
  if (!loan) return null;
  if (loan.userId === actor.userId) return loan;
  const householdId = loan.householdId;
  if (!householdId) return null;
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId, userId: actor.userId } },
  });
  if (!member) return null;
  if (mode === "write" && member.role !== "OWNER" && member.role !== "CO_OWNER") return null;
  return loan;
}

export async function authorizeFixedDeposit(actor: Actor, id: string, mode: "read" | "write") {
  const fd = await prisma.fixedDeposit.findFirst({ where: { id, deletedAt: null } });
  if (!fd) return null;
  if (fd.userId === actor.userId) return fd;
  if (!fd.householdId) return null;
  const member = await prisma.householdMember.findUnique({
    where: { householdId_userId: { householdId: fd.householdId, userId: actor.userId } },
  });
  if (!member) return null;
  if (mode === "write" && member.role !== "OWNER" && member.role !== "CO_OWNER") return null;
  return fd;
}
