-- AlterTable
ALTER TABLE "messages" ADD COLUMN     "attachments" JSONB,
ADD COLUMN     "embeds" JSONB;

-- CreateTable
CREATE TABLE "emojis" (
    "id" TEXT NOT NULL,
    "serverId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "imageUrl" TEXT NOT NULL,
    "uploaderId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "emojis_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "emojis_serverId_name_key" ON "emojis"("serverId", "name");

-- AddForeignKey
ALTER TABLE "emojis" ADD CONSTRAINT "emojis_serverId_fkey" FOREIGN KEY ("serverId") REFERENCES "servers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
