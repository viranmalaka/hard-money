CREATE TABLE "ShoppingListItem" (
    "id" TEXT NOT NULL,
    "householdId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" TEXT,
    "isCompleted" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "completedAt" TIMESTAMP(3),
    "serverSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "ShoppingListItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ShoppingListItem_householdId_idx" ON "ShoppingListItem"("householdId");
CREATE INDEX "ShoppingListItem_serverSeq_idx" ON "ShoppingListItem"("serverSeq");
CREATE INDEX "ShoppingListItem_householdId_isCompleted_position_idx" ON "ShoppingListItem"("householdId", "isCompleted", "position");

ALTER TABLE "ShoppingListItem" ADD CONSTRAINT "ShoppingListItem_householdId_fkey"
  FOREIGN KEY ("householdId") REFERENCES "Household"("id") ON DELETE CASCADE ON UPDATE CASCADE;
