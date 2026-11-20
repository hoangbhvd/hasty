-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "gallery_token" UUID NOT NULL DEFAULT gen_random_uuid();

-- AlterTable
ALTER TABLE "property_media" ADD COLUMN     "album_id" UUID,
ADD COLUMN     "thumb_url" TEXT;

-- CreateTable
CREATE TABLE "property_albums" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "name" TEXT NOT NULL,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "share_token" UUID NOT NULL DEFAULT gen_random_uuid(),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "property_albums_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "property_albums_share_token_key" ON "property_albums"("share_token");

-- CreateIndex
CREATE INDEX "property_albums_property_id_idx" ON "property_albums"("property_id");

-- CreateIndex
CREATE UNIQUE INDEX "properties_gallery_token_key" ON "properties"("gallery_token");

-- CreateIndex
CREATE INDEX "property_media_album_id_idx" ON "property_media"("album_id");

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_album_id_fkey" FOREIGN KEY ("album_id") REFERENCES "property_albums"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_albums" ADD CONSTRAINT "property_albums_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_albums" ADD CONSTRAINT "property_albums_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;

