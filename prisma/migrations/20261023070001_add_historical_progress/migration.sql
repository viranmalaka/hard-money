-- AlterTable
ALTER TABLE "FixedDeposit" ADD COLUMN     "paidPeriods" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "Loan" ADD COLUMN     "paidInstallments" INTEGER NOT NULL DEFAULT 0;
