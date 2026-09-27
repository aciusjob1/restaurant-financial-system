-- AlterTable
ALTER TABLE "Shift" ADD COLUMN     "openingCashSetByUserId" TEXT;

-- AddForeignKey
ALTER TABLE "Shift" ADD CONSTRAINT "Shift_openingCashSetByUserId_fkey" FOREIGN KEY ("openingCashSetByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
