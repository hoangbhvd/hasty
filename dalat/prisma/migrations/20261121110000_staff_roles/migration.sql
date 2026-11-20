-- CreateEnum
CREATE TYPE "LinkAccessRole" AS ENUM ('BROKER', 'CO_HOST', 'CARETAKER');

-- AlterTable
ALTER TABLE "host_broker_links" ADD COLUMN     "access_role" "LinkAccessRole" NOT NULL DEFAULT 'BROKER',
ADD COLUMN     "allow_instant_book" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "assigned_property_ids" JSONB;


-- Giữ nguyên hành vi hiện tại cho các liên kết đã có: CTV đã duyệt vẫn được tạo booking chốt ngay.
-- Liên kết mới sẽ mặc định false (CTV phải giữ phòng 30 phút), chủ nhà bật riêng cho CTV ruột.
UPDATE "host_broker_links" SET "allow_instant_book" = true;
