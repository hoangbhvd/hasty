-- CreateEnum
CREATE TYPE "NetNegotiationStatus" AS ENUM ('NONE', 'PENDING', 'APPROVED', 'REJECTED');

-- AlterEnum
ALTER TYPE "MsgType" ADD VALUE 'ACTION_NET_PRICE_REQ';

-- AlterTable
ALTER TABLE "bookings" ADD COLUMN     "net_price_negotiation_status" "NetNegotiationStatus" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "pending_net_price" DECIMAL(12,0);
