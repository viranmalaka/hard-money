import { prisma } from "@/lib/prisma";

export async function matchAccountForSms(
  userId: string,
  sender: string,
  accountLast4: string | null | undefined
) {
  if (!accountLast4) {
    return null;
  }

  const normSender = sender.trim().toUpperCase();
  const cleanLast4 = accountLast4.trim();

  // Find all candidate accounts for this user that share the same last 4 digits
  const candidateAccounts = await prisma.account.findMany({
    where: {
      userId,
      deletedAt: null,
      accountNumberLast4: cleanLast4,
    },
  });

  if (candidateAccounts.length === 0) {
    return null;
  }

  // 1. Strict match: bankSenderIds contains sender
  const strictMatches = candidateAccounts.filter((acc) => {
    if (!acc.bankSenderIds || !Array.isArray(acc.bankSenderIds)) return false;
    return acc.bankSenderIds.some(
      (id) => id.toUpperCase() === normSender || normSender.includes(id.toUpperCase())
    );
  });

  if (strictMatches.length === 1) {
    return strictMatches[0];
  }

  // 2. Name contains sender if bankSenderIds was not configured
  const nameMatches = candidateAccounts.filter((acc) =>
    acc.name.toUpperCase().includes(normSender)
  );

  if (nameMatches.length === 1) {
    return nameMatches[0];
  }

  // If there's only 1 candidate overall and no conflict
  if (candidateAccounts.length === 1 && strictMatches.length === 0) {
    return candidateAccounts[0];
  }

  return null;
}
