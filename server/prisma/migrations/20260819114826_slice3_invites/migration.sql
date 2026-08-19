-- AlterTable
ALTER TABLE "invites" ADD COLUMN     "serverId" TEXT;

-- CreateIndex
CREATE INDEX "invites_serverId_idx" ON "invites"("serverId");

-- AddForeignKey
ALTER TABLE "invites" ADD CONSTRAINT "invites_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
