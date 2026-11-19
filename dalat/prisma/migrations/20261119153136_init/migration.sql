-- CreateEnum
CREATE TYPE "LinkTier" AS ENUM ('STANDARD', 'VIP', 'AGENCY');

-- CreateEnum
CREATE TYPE "LinkStatus" AS ENUM ('PENDING', 'APPROVED', 'BLOCKED');

-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('HOST_MANAGED', 'BROKER_EXTERNAL');

-- CreateEnum
CREATE TYPE "Area" AS ENUM ('TRUNG_TAM', 'TUYEN_LAM', 'TRAI_MAT', 'TA_NUNG', 'DA_PHU', 'PHUONG_11', 'KHAC');

-- CreateEnum
CREATE TYPE "RoadAccess" AS ENUM ('MOTORBIKE', 'CAR_7', 'CAR_16', 'BUS_29');

-- CreateEnum
CREATE TYPE "SlopeLevel" AS ENUM ('FLAT', 'MILD_SLOPE', 'STEEP');

-- CreateEnum
CREATE TYPE "MediaType" AS ENUM ('IMAGE', 'VIDEO');

-- CreateEnum
CREATE TYPE "BookingType" AS ENUM ('WHOLE_UNIT', 'ROOMS', 'EXTERNAL_MANUAL');

-- CreateEnum
CREATE TYPE "BookingStatus" AS ENUM ('HOLDING', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PayerRole" AS ENUM ('GUEST', 'BROKER', 'HOST');

-- CreateEnum
CREATE TYPE "ReceiverRole" AS ENUM ('BROKER', 'HOST');

-- CreateEnum
CREATE TYPE "TxType" AS ENUM ('DEPOSIT', 'BALANCE', 'COMMISSION_SETTLEMENT', 'REFUND');

-- CreateEnum
CREATE TYPE "TxStatus" AS ENUM ('PENDING_CONFIRM', 'CONFIRMED', 'REJECTED');

-- CreateEnum
CREATE TYPE "MsgType" AS ENUM ('TEXT', 'IMAGE', 'ACTION_HOLD_REQ', 'ACTION_BILL_UPLOAD', 'ACTION_MEDIA_PACK');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateTable
CREATE TABLE "users" (
    "id" UUID NOT NULL,
    "phone" TEXT,
    "email" TEXT NOT NULL,
    "email_verified" BOOLEAN NOT NULL DEFAULT false,
    "full_name" TEXT NOT NULL,
    "avatar_url" TEXT,
    "is_host" BOOLEAN NOT NULL DEFAULT true,
    "is_broker" BOOLEAN NOT NULL DEFAULT true,
    "bank_id" TEXT,
    "bank_account_no" TEXT,
    "bank_account_name" TEXT,
    "telegram_chat_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sessions" (
    "id" UUID NOT NULL,
    "token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accounts" (
    "id" UUID NOT NULL,
    "account_id" TEXT NOT NULL,
    "provider_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "access_token" TEXT,
    "refresh_token" TEXT,
    "id_token" TEXT,
    "access_token_expires_at" TIMESTAMP(3),
    "refresh_token_expires_at" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verifications" (
    "id" UUID NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verifications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "host_broker_links" (
    "id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "tier" "LinkTier" NOT NULL DEFAULT 'STANDARD',
    "status" "LinkStatus" NOT NULL DEFAULT 'PENDING',

    CONSTRAINT "host_broker_links_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "properties" (
    "id" UUID NOT NULL,
    "source_type" "SourceType" NOT NULL DEFAULT 'HOST_MANAGED',
    "host_id" UUID,
    "created_by_broker_id" UUID,
    "external_host_name" TEXT,
    "external_host_phone" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "allow_whole_unit" BOOLEAN NOT NULL DEFAULT true,
    "allow_individual_rooms" BOOLEAN NOT NULL DEFAULT false,
    "area" "Area" NOT NULL DEFAULT 'KHAC',
    "distance_to_market_km" DOUBLE PRECISION,
    "road_access" "RoadAccess" NOT NULL DEFAULT 'MOTORBIKE',
    "slope_level" "SlopeLevel" NOT NULL DEFAULT 'FLAT',
    "amenities" JSONB NOT NULL DEFAULT '{}',
    "google_maps_url" TEXT,
    "checkin_guide" TEXT,
    "caretaker_phone" TEXT,
    "house_rules" TEXT,
    "base_weekday_net" DECIMAL(12,0),
    "base_weekend_net" DECIMAL(12,0),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "properties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "rooms" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "max_guests" INTEGER NOT NULL DEFAULT 2,
    "base_weekday_net" DECIMAL(12,0),
    "base_weekend_net" DECIMAL(12,0),

    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "property_media" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "url" TEXT NOT NULL,
    "media_type" "MediaType" NOT NULL DEFAULT 'IMAGE',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "property_media_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "special_prices" (
    "id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "room_id" UUID,
    "date" DATE NOT NULL,
    "net_price" DECIMAL(12,0) NOT NULL,
    "broker_tier" "LinkTier",

    CONSTRAINT "special_prices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bookings" (
    "id" UUID NOT NULL,
    "booking_code" TEXT NOT NULL,
    "voucher_token" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "host_id" UUID,
    "broker_id" UUID,
    "booking_type" "BookingType" NOT NULL,
    "manual_room_info" TEXT,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guest_name" TEXT NOT NULL,
    "guest_phone" TEXT,
    "guest_count" INTEGER NOT NULL DEFAULT 1,
    "guest_note" TEXT,
    "status" "BookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "hold_expires_at" TIMESTAMP(3),
    "guest_total_price" DECIMAL(12,0) NOT NULL,
    "host_net_price" DECIMAL(12,0) NOT NULL,
    "extra_fees" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "commission_amount" DECIMAL(12,0) NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bookings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "booking_rooms" (
    "booking_id" UUID NOT NULL,
    "room_id" UUID NOT NULL,

    CONSTRAINT "booking_rooms_pkey" PRIMARY KEY ("booking_id","room_id")
);

-- CreateTable
CREATE TABLE "booking_addons" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "service_name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "guest_price" DECIMAL(12,0) NOT NULL,
    "net_price" DECIMAL(12,0) NOT NULL,

    CONSTRAINT "booking_addons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" UUID NOT NULL,
    "booking_id" UUID NOT NULL,
    "payer_role" "PayerRole" NOT NULL,
    "receiver_role" "ReceiverRole" NOT NULL,
    "amount" DECIMAL(12,0) NOT NULL,
    "tx_type" "TxType" NOT NULL,
    "bill_image_url" TEXT,
    "status" "TxStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmed_at" TIMESTAMP(3),

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL,
    "booking_id" UUID,
    "host_id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "last_message_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "sender_id" UUID,
    "msg_type" "MsgType" NOT NULL DEFAULT 'TEXT',
    "content" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_requests" (
    "id" UUID NOT NULL,
    "broker_id" UUID NOT NULL,
    "check_in" DATE NOT NULL,
    "check_out" DATE NOT NULL,
    "guest_count" INTEGER NOT NULL,
    "area" "Area",
    "road_access" "RoadAccess",
    "max_budget" DECIMAL(12,0),
    "note" TEXT,
    "status" "RequestStatus" NOT NULL DEFAULT 'OPEN',
    "expires_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "room_request_offers" (
    "id" UUID NOT NULL,
    "request_id" UUID NOT NULL,
    "host_id" UUID NOT NULL,
    "property_id" UUID NOT NULL,
    "offered_net_price" DECIMAL(12,0) NOT NULL,
    "note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "room_request_offers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_phone_key" ON "users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "sessions_token_key" ON "sessions"("token");

-- CreateIndex
CREATE INDEX "sessions_user_id_idx" ON "sessions"("user_id");

-- CreateIndex
CREATE INDEX "accounts_user_id_idx" ON "accounts"("user_id");

-- CreateIndex
CREATE INDEX "verifications_identifier_idx" ON "verifications"("identifier");

-- CreateIndex
CREATE UNIQUE INDEX "host_broker_links_host_id_broker_id_key" ON "host_broker_links"("host_id", "broker_id");

-- CreateIndex
CREATE INDEX "properties_host_id_idx" ON "properties"("host_id");

-- CreateIndex
CREATE INDEX "properties_created_by_broker_id_idx" ON "properties"("created_by_broker_id");

-- CreateIndex
CREATE INDEX "rooms_property_id_idx" ON "rooms"("property_id");

-- CreateIndex
CREATE INDEX "property_media_property_id_idx" ON "property_media"("property_id");

-- CreateIndex
CREATE INDEX "special_prices_property_id_date_idx" ON "special_prices"("property_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_booking_code_key" ON "bookings"("booking_code");

-- CreateIndex
CREATE UNIQUE INDEX "bookings_voucher_token_key" ON "bookings"("voucher_token");

-- CreateIndex
CREATE INDEX "bookings_property_id_check_in_check_out_idx" ON "bookings"("property_id", "check_in", "check_out");

-- CreateIndex
CREATE INDEX "bookings_host_id_idx" ON "bookings"("host_id");

-- CreateIndex
CREATE INDEX "bookings_broker_id_idx" ON "bookings"("broker_id");

-- CreateIndex
CREATE INDEX "bookings_status_hold_expires_at_idx" ON "bookings"("status", "hold_expires_at");

-- CreateIndex
CREATE INDEX "booking_rooms_room_id_idx" ON "booking_rooms"("room_id");

-- CreateIndex
CREATE INDEX "booking_addons_booking_id_idx" ON "booking_addons"("booking_id");

-- CreateIndex
CREATE INDEX "transactions_booking_id_idx" ON "transactions"("booking_id");

-- CreateIndex
CREATE INDEX "conversations_booking_id_idx" ON "conversations"("booking_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "room_requests_status_expires_at_idx" ON "room_requests"("status", "expires_at");

-- CreateIndex
CREATE INDEX "room_request_offers_request_id_idx" ON "room_request_offers"("request_id");

-- AddForeignKey
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_broker_links" ADD CONSTRAINT "host_broker_links_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "host_broker_links" ADD CONSTRAINT "host_broker_links_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "properties" ADD CONSTRAINT "properties_created_by_broker_id_fkey" FOREIGN KEY ("created_by_broker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "property_media" ADD CONSTRAINT "property_media_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_prices" ADD CONSTRAINT "special_prices_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "special_prices" ADD CONSTRAINT "special_prices_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_rooms" ADD CONSTRAINT "booking_rooms_room_id_fkey" FOREIGN KEY ("room_id") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "booking_addons" ADD CONSTRAINT "booking_addons_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_booking_id_fkey" FOREIGN KEY ("booking_id") REFERENCES "bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_sender_id_fkey" FOREIGN KEY ("sender_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_requests" ADD CONSTRAINT "room_requests_broker_id_fkey" FOREIGN KEY ("broker_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_request_offers" ADD CONSTRAINT "room_request_offers_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "room_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_request_offers" ADD CONSTRAINT "room_request_offers_host_id_fkey" FOREIGN KEY ("host_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "room_request_offers" ADD CONSTRAINT "room_request_offers_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
