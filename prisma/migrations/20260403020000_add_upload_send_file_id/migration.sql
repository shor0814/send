-- AlterTable
ALTER TABLE "Upload" ADD COLUMN "sendFileId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Upload_sendFileId_key" ON "Upload"("sendFileId");
