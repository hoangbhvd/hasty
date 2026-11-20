import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookingForParty, bookingLedger, directionsFor, type PartyRole } from "@/lib/booking-finance";
import { BookingActions } from "@/components/booking-actions";
import { Badge, BOOKING_TONE, type BadgeTone } from "@/components/ui/badge";
import { STATUS_LABEL } from "@/components/booking-list";
import { CopyButton } from "@/components/copy-button";
import { AddonForm, DeleteAddonButton, ExtraFeeForm, TransactionForm, TxDecision } from "@/components/booking-finance-forms";
import { formatDateTimeVi, formatDateVi, formatVnd } from "@/lib/format";
import { r2Configured } from "@/lib/r2";
import { confirmerRole } from "@/lib/tx-roles";
import { openBookingChatAction } from "@/app/(app)/chat-actions";

const TYPE_LABEL = { DEPOSIT: "Cọc", BALANCE: "Thanh toán", COMMISSION_SETTLEMENT: "Quyết toán hoa hồng", REFUND: "Hoàn tiền" } as const;
const DIR_LABEL = {
  "GUEST>BROKER": "Khách → CTV", "GUEST>HOST": "Khách → Chủ nhà", "BROKER>HOST": "CTV → Chủ nhà", "HOST>BROKER": "Chủ nhà → CTV",
  "HOST>GUEST": "Chủ nhà → Khách (hoàn tiền)", "BROKER>GUEST": "CTV → Khách (hoàn tiền)",
} as const;
const TX_TONE: Record<string, BadgeTone> = { PENDING_CONFIRM: "holding", CONFIRMED: "confirmed", REJECTED: "cancelled" };
const TX_LABEL: Record<string, string> = { PENDING_CONFIRM: "Chờ xác nhận", CONFIRMED: "Đã xác nhận", REJECTED: "Bị từ chối" };

function Row({ k, v, strong }: { k: string; v: React.ReactNode; strong?: boolean }) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt>{k}</dt>
      <dd className={`money-num text-right ${strong ? "font-extrabold" : "font-semibold"}`}>{v}</dd>
    </div>
  );
}

function debtText(owed: number, viewer: PartyRole): string {
  if (owed === 0) return "Đã cân bằng, không có công nợ";
  const n = formatVnd(Math.abs(owed));
  if (owed > 0) return viewer === "HOST" ? `CTV còn nợ bạn ${n}` : `Bạn còn phải chuyển cho chủ nhà ${n}`;
  return viewer === "HOST" ? `Bạn còn phải chuyển hoa hồng cho CTV ${n}` : `Chủ nhà còn phải chuyển cho bạn ${n}`;
}

export async function BookingDetail({ userId, bookingId, viewer }: { userId: string; bookingId: string; viewer: PartyRole }) {
  if (!/^[0-9a-f-]{36}$/.test(bookingId)) notFound();
  const loaded = await getBookingForParty(userId, bookingId);
  // Mỗi vai trò chỉ xem booking của mình qua đúng màn hình của vai trò đó
  if (!loaded || loaded.role !== viewer) notFound();
  const { booking: b, external } = loaded;
  const l = bookingLedger(b);

  const base = (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const voucherUrl = `${base}/voucher/${b.voucherToken}`;
  const canExtra = ["CONFIRMED", "CHECKED_IN", "CHECKED_OUT"].includes(b.status) && (viewer === "HOST" || external);
  const hasBoth = !!b.hostId && !!b.brokerId;
  const dirs = directionsFor(!!b.hostId, !!b.brokerId).map((d) => ({ value: d, label: DIR_LABEL[d] }));
  const types = (Object.keys(TYPE_LABEL) as (keyof typeof TYPE_LABEL)[]).map((t) => ({ value: t, label: TYPE_LABEL[t] }));
  const backHref = viewer === "HOST" ? "/host/calendar" : "/broker/bookings";
  const roomText = b.bookingType === "ROOMS" ? b.rooms.map((r) => r.room.name).join(", ") : b.bookingType === "EXTERNAL_MANUAL" ? b.manualRoomInfo : "Nguyên căn";

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <Link href={backHref} className="text-sm text-muted-foreground">← Quay lại</Link>
        <div className="flex flex-wrap items-center gap-2 pt-1">
          <h1 className="text-2xl font-bold">{b.guestName}</h1>
          <Badge tone={BOOKING_TONE[b.status]}>{STATUS_LABEL[b.status]}</Badge>
        </div>
        <p className="font-mono text-sm text-muted-foreground">{b.bookingCode}</p>
      </div>

      <section className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
        <dl className="text-sm">
          <Row k="Căn" v={b.property.name} />
          <Row k="Hạng phòng" v={roomText || "—"} />
          <Row k="Nhận → trả phòng" v={`${formatDateVi(b.checkIn)} → ${formatDateVi(b.checkOut)}`} />
          <Row k="Số khách" v={b.guestCount} />
          {b.guestPhone && <Row k="SĐT khách" v={b.guestPhone} />}
          {viewer === "HOST" && b.broker && <Row k="CTV" v={`${b.broker.fullName} ${b.broker.phone ?? ""}`} />}
          {viewer === "BROKER" && b.host && <Row k="Chủ nhà" v={`${b.host.fullName} ${b.host.phone ?? ""}`} />}
          {b.holdExpiresAt && b.status === "HOLDING" && <Row k="Giữ đến" v={formatDateTimeVi(b.holdExpiresAt)} />}
          {b.guestNote && <Row k="Ghi chú" v={b.guestNote} />}
        </dl>
        <div className="flex flex-wrap items-center gap-2">
          <BookingActions id={b.id} status={b.status} />
          {hasBoth && (
            <form action={openBookingChatAction.bind(null, b.id, viewer)}>
              <button type="submit" className="brutal-btn inline-flex h-9 items-center bg-white px-3 text-sm text-black">💬 Chat về booking</button>
            </form>
          )}
        </div>
      </section>

      <section className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
        <h2 className="font-bold">Booking Confirmation gửi khách</h2>
        <p className="text-xs text-muted-foreground">Trang công khai, không hiển thị giá Net, hoa hồng hay công nợ.</p>
        <div className="flex items-center gap-2">
          <input readOnly value={voucherUrl} aria-label="Link voucher" className="brutal-input h-10 min-w-0 flex-1 bg-muted px-2 text-sm" />
          <CopyButton text={voucherUrl} />
          <a href={voucherUrl} target="_blank" rel="noopener noreferrer" className="brutal-btn inline-flex h-10 items-center bg-primary px-3 text-sm text-black">Mở</a>
        </div>
      </section>

      <section className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
        <h2 className="font-bold">Tài chính</h2>
        <dl className="divide-y divide-black/20 text-sm">
          <Row k="Tiền phòng (khách trả)" v={formatVnd(b.guestTotalPrice)} />
          {l.addonsGuest > 0 && <Row k="Dịch vụ đi kèm" v={formatVnd(l.addonsGuest)} />}
          {Number(b.extraFees) > 0 && <Row k="Phụ thu" v={formatVnd(b.extraFees)} />}
          <Row k="Tổng khách phải trả" v={formatVnd(l.guestPayable)} strong />
          <Row k="Khách đã thanh toán (đã trừ hoàn tiền)" v={formatVnd(l.guestPaid)} />
          {l.guestRefunded > 0 && <Row k="  Đã hoàn lại cho khách" v={formatVnd(l.guestRefunded)} />}
          <Row k="Khách còn phải trả lúc check-in" v={formatVnd(Math.max(l.guestRemaining, 0))} strong />
        </dl>
        {(hasBoth || viewer === "BROKER") && (
          <dl className="divide-y divide-black/20 border-t border-black pt-2 text-sm">
            {viewer === "HOST" ? (
              <>
                <Row k="Chủ nhận (Net + dịch vụ + phụ thu)" v={formatVnd(l.hostEntitled)} />
                <Row k="Chủ đã nhận thực tế" v={formatVnd(l.hostCash)} />
              </>
            ) : (
              <>
                <Row k="Giá Net" v={formatVnd(b.hostNetPrice)} />
                <Row k="Hoa hồng của bạn" v={formatVnd(l.commission)} strong />
                <Row k="  Đã nhận" v={formatVnd(l.commissionRealized)} />
                <Row k="  Chờ nhận" v={formatVnd(l.commissionPending)} />
              </>
            )}
            {hasBoth && <Row k="Công nợ" v={debtText(l.owedToHost, viewer)} strong />}
          </dl>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="font-bold">Dịch vụ đi kèm</h2>
        {b.addons.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có dịch vụ.</p> : (
          <ul className="divide-y divide-black rounded border border-black bg-white">
            {b.addons.map((a) => (
              <li key={a.id} className="flex items-center justify-between gap-2 p-3 text-sm">
                <div>
                  <div className="font-medium">{a.serviceName} × {a.quantity}</div>
                  <div className="money-num text-muted-foreground">Bán {formatVnd(a.guestPrice)} · Net {formatVnd(a.netPrice)}</div>
                </div>
                {b.status !== "CANCELLED" && <DeleteAddonButton bookingId={b.id} addonId={a.id} />}
              </li>
            ))}
          </ul>
        )}
        {b.status !== "CANCELLED" && <AddonForm bookingId={b.id} />}
      </section>

      {canExtra && (
        <section className="space-y-3">
          <h2 className="font-bold">Phụ thu check-out</h2>
          <ExtraFeeForm bookingId={b.id} current={Number(b.extraFees)} />
        </section>
      )}

      <section className="space-y-3">
        <h2 className="font-bold">Giao dịch</h2>
        {b.transactions.length === 0 ? <p className="text-sm text-muted-foreground">Chưa có giao dịch.</p> : (
          <ul className="divide-y divide-black rounded border border-black bg-white">
            {b.transactions.map((t) => {
              const dir = `${t.payerRole}>${t.receiverRole}` as keyof typeof DIR_LABEL;
              const mine = t.status === "PENDING_CONFIRM" && confirmerRole(t) === viewer; // hoàn tiền cho khách: bên TRẢ xác nhận
              return (
                <li key={t.id} className="space-y-2 p-3 text-sm">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-medium">{TYPE_LABEL[t.txType]} · {DIR_LABEL[dir]}</div>
                    <Badge tone={TX_TONE[t.status]}>{TX_LABEL[t.status]}</Badge>
                  </div>
                  <div className="money-num text-base font-bold">{formatVnd(t.amount)}</div>
                  <div className="text-xs text-muted-foreground">{formatDateTimeVi(t.createdAt)}</div>
                  {t.billImageUrl && (
                    <a href={t.billImageUrl} target="_blank" rel="noopener noreferrer" className="inline-block underline">Xem ảnh bill</a>
                  )}
                  {mine && <TxDecision bookingId={b.id} txId={t.id} />}
                </li>
              );
            })}
          </ul>
        )}
        <TransactionForm bookingId={b.id} directions={dirs} types={types} r2Ready={r2Configured()} />
      </section>
    </div>
  );
}
