-- Khu vực Đà Lạt mới (DalatArea) thay enum Area cũ; dữ liệu cũ được ánh xạ sang khu vực mới tương ứng.
CREATE TYPE "DalatArea" AS ENUM ('TRUNG_TAM', 'CAN_TRUNG_TAM', 'HUNG_VUONG_TRAI_MAT', 'TUYEN_LAM_PRENN_MIMOSA', 'AN_SON_TRIEU_VIET_VUONG', 'TA_NUNG_CAM_LY', 'DA_PHU_LANGBIANG', 'KHAC');

ALTER TABLE "properties" ALTER COLUMN "area" DROP DEFAULT;
ALTER TABLE "properties" ALTER COLUMN "area" TYPE "DalatArea" USING (
  CASE "area"::text
    WHEN 'TUYEN_LAM' THEN 'TUYEN_LAM_PRENN_MIMOSA'
    WHEN 'TRAI_MAT' THEN 'HUNG_VUONG_TRAI_MAT'
    WHEN 'TA_NUNG' THEN 'TA_NUNG_CAM_LY'
    WHEN 'DA_PHU' THEN 'DA_PHU_LANGBIANG'
    WHEN 'PHUONG_11' THEN 'CAN_TRUNG_TAM'
    ELSE "area"::text
  END
)::"DalatArea";
ALTER TABLE "properties" ALTER COLUMN "area" SET DEFAULT 'KHAC';

ALTER TABLE "room_requests" ALTER COLUMN "area" TYPE "DalatArea" USING (
  CASE "area"::text
    WHEN 'TUYEN_LAM' THEN 'TUYEN_LAM_PRENN_MIMOSA'
    WHEN 'TRAI_MAT' THEN 'HUNG_VUONG_TRAI_MAT'
    WHEN 'TA_NUNG' THEN 'TA_NUNG_CAM_LY'
    WHEN 'DA_PHU' THEN 'DA_PHU_LANGBIANG'
    WHEN 'PHUONG_11' THEN 'CAN_TRUNG_TAM'
    ELSE "area"::text
  END
)::"DalatArea";

DROP TYPE "Area";

-- Co-host xem giá Net: chủ nhà bật/tắt theo từng đối tác
ALTER TABLE "host_broker_links" ADD COLUMN "co_host_sees_net" BOOLEAN NOT NULL DEFAULT false;
