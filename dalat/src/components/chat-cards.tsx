"use client";

import Link from "next/link";
import { Download, Video } from "lucide-react";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { ActionButton } from "@/components/action-button";
import { TxDecision } from "@/components/booking-finance-forms";
import { decideHoldAction } from "@/app/(app)/chat-actions";
import { formatVnd } from "@/lib/format";
import type { MessageDto, ChatRole } from "@/lib/chat";

const card = "w-full max-w-sm space-y-2 rounded border border-black bg-white p-3 text-sm text-black shadow-[2px_2px_0px_0px_#000]";
const dmy = (s: string) => s.split("-").reverse().join("/");

const HOLD_TONE: Record<string, BadgeTone> = { PENDING: "holding", PROCESSING: "holding", ACCEPTED: "confirmed", REJECTED: "cancelled", FAILED: "cancelled" };
const HOLD_LABEL: Record<string, string> = { PENDING: "Chờ chủ nhà", PROCESSING: "Đang xử lý…", ACCEPTED: "Đã giữ phòng", REJECTED: "Đã từ chối", FAILED: "Không giữ được" };

export function HoldRequestCard({ m, role }: { m: MessageDto; role: ChatRole }) {
  const x = m.metadata as Record<string, string | number | string[] | null>;
  const status = String(x.status);
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <b>⏱ Xin giữ phòng 30 phút</b>
        <Badge tone={HOLD_TONE[status] ?? "neutral"}>{HOLD_LABEL[status] ?? status}</Badge>
      </div>
      <div>{String(x.propertyName)}{Array.isArray(x.roomNames) && x.roomNames.length > 0 ? ` · ${x.roomNames.join(", ")}` : " · Nguyên căn"}</div>
      <div className="money-num text-muted-foreground">{dmy(String(x.checkIn))} → {dmy(String(x.checkOut))} · {x.guestCount} khách · {String(x.guestName)}</div>
      {status === "FAILED" && <p className="font-medium text-red-700">{String(x.reason ?? "")}</p>}
      {status === "ACCEPTED" && x.bookingId && (
        <Link href={`/${role === "HOST" ? "host" : "broker"}/bookings/${x.bookingId}`} className="font-medium underline">Mở booking {String(x.bookingCode ?? "")}</Link>
      )}
      {status === "PENDING" && role === "HOST" && (
        <div className="flex flex-wrap gap-2 pt-1">
          <ActionButton action={() => decideHoldAction(m.id, true)} className="bg-secondary">Đồng ý giữ 30p</ActionButton>
          <ActionButton action={() => decideHoldAction(m.id, false)} confirm="Từ chối yêu cầu giữ phòng?" className="bg-destructive">Từ chối</ActionButton>
        </div>
      )}
    </div>
  );
}

const TX_TONE: Record<string, BadgeTone> = { PENDING_CONFIRM: "holding", CONFIRMED: "confirmed", REJECTED: "cancelled" };
const TX_LABEL: Record<string, string> = { PENDING_CONFIRM: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", REJECTED: "Bị từ chối" };
const TYPE_LABEL: Record<string, string> = { DEPOSIT: "Cọc", BALANCE: "Thanh toán", COMMISSION_SETTLEMENT: "Quyết toán hoa hồng", REFUND: "Hoàn tiền" };

export function BillCard({ m, role }: { m: MessageDto; role: ChatRole }) {
  const x = m.metadata as { transactionId: string; bookingId: string; bookingCode?: string; tx: { amount: number; status: string; txType: string; receiverRole: string; billImageUrl: string | null } | null };
  const tx = x.tx;
  return (
    <div className={card}>
      <div className="flex items-center justify-between gap-2">
        <b>💸 Bill chuyển khoản</b>
        {tx && <Badge tone={TX_TONE[tx.status]}>{TX_LABEL[tx.status]}</Badge>}
      </div>
      {tx ? (
        <>
          <div className="money-num text-lg font-extrabold">{formatVnd(tx.amount)}</div>
          <div className="text-muted-foreground">{TYPE_LABEL[tx.txType]} · {x.bookingCode}</div>
          {tx.billImageUrl && <a href={tx.billImageUrl} target="_blank" rel="noopener noreferrer" className="font-medium underline">Xem ảnh bill</a>}
          {tx.status === "PENDING_CONFIRM" && tx.receiverRole === role && <TxDecision bookingId={x.bookingId} txId={x.transactionId} />}
        </>
      ) : <div className="text-muted-foreground">Giao dịch không còn tồn tại.</div>}
      <Link href={`/${role === "HOST" ? "host" : "broker"}/bookings/${x.bookingId}`} className="block font-medium underline">Mở booking</Link>
    </div>
  );
}

export function MediaPackCard({ m, role }: { m: MessageDto; role: ChatRole }) {
  const x = m.metadata as { propertyId: string; propertyName: string; total: number; items: { id: string; url: string; type: string }[] };
  return (
    <div className={card}>
      <b>🖼 Bộ ảnh {x.propertyName}</b>
      <div className="grid grid-cols-3 gap-1">
        {x.items.map((it) => (
          <div key={it.id} className="relative aspect-square overflow-hidden rounded border border-black bg-muted">
            {it.type === "IMAGE"
              // eslint-disable-next-line @next/next/no-img-element
              ? <img src={it.url} alt="" loading="lazy" className="size-full object-cover" />
              : <div className="grid size-full place-items-center"><Video className="size-6" /></div>}
          </div>
        ))}
      </div>
      <div className="text-muted-foreground">{x.total} ảnh/video</div>
      <Link href={`/${role === "HOST" ? "host" : "broker"}/properties/${x.propertyId}`} className="brutal-btn inline-flex h-10 items-center gap-1 bg-primary px-3 text-black">
        <Download className="size-4" /> Xem &amp; tải ảnh sạch
      </Link>
    </div>
  );
}
