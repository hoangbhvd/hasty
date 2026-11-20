-- AlterEnum
ALTER TYPE "LinkStatus" ADD VALUE 'REJECTED';

-- AlterTable
ALTER TABLE "host_broker_links" ADD COLUMN     "request_note" TEXT,
ADD COLUMN     "responded_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "cover_image_url" TEXT,
ADD COLUMN     "is_public_directory" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "public_price_range" TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "broker_bio" TEXT;
