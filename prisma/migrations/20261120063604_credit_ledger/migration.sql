-- CreateEnum
CREATE TYPE "CreditEntryType" AS ENUM ('SALE', 'REPAYMENT');

-- CreateTable
CREATE TABLE "CreditEntry" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" "CreditEntryType" NOT NULL,
    "amount" INTEGER NOT NULL,
    "method" "PaymentMethod",
    "reference" TEXT,
    "orderId" TEXT,
    "shiftId" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditEntry_tenantId_customerId_createdAt_idx" ON "CreditEntry"("tenantId", "customerId", "createdAt");

-- CreateIndex
CREATE INDEX "CreditEntry_shiftId_idx" ON "CreditEntry"("shiftId");

-- AddForeignKey
ALTER TABLE "CreditEntry" ADD CONSTRAINT "CreditEntry_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
