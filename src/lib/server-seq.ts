import { prisma } from "./prisma";

let sequenceInitialized = false;

export async function getNextServerSeq(): Promise<bigint> {
  try {
    const result = await prisma.$queryRawUnsafe<{ nextval: string | number | bigint }[]>(
      "SELECT nextval('global_server_seq') as nextval"
    );
    if (result && result.length > 0) {
      return BigInt(result[0].nextval);
    }
  } catch {
    if (!sequenceInitialized) {
      try {
        await prisma.$executeRawUnsafe(
          "CREATE SEQUENCE IF NOT EXISTS global_server_seq START WITH 1 INCREMENT BY 1"
        );
        sequenceInitialized = true;
      } catch {
        // ignore if concurrent creation
      }
    }
    try {
      const result = await prisma.$queryRawUnsafe<{ nextval: string | number | bigint }[]>(
        "SELECT nextval('global_server_seq') as nextval"
      );
      if (result && result.length > 0) {
        return BigInt(result[0].nextval);
      }
    } catch (err) {
      console.warn("Failed to get nextval from postgres sequence, falling back to SyncSequence:", err);
    }
  }

  // Fallback to SyncSequence row
  const updated = await prisma.syncSequence.upsert({
    where: { id: 1 },
    update: { seq: { increment: 1 } },
    create: { id: 1, seq: 1 },
  });
  return updated.seq;
}

