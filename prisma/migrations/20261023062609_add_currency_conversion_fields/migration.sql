-- AlterTable
ALTER TABLE "Transaction" ADD COLUMN     "destinationAmountMinor" INTEGER,
ADD COLUMN     "exchangeRateMicros" INTEGER;
