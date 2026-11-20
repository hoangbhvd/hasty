"use client";

import { Fragment, useState } from "react";
import Link from "next/link";
import { ChevronDown, ChevronRight, Phone, X } from "lucide-react";
import { ActionButton } from "@/components/action-button";
import type { BlockDetail, Matrix, MatrixBlock, MatrixProperty, MatrixRow } from "@/lib/availability-matrix";
import { ACCESS_ROLE_LABEL } from "@/lib/labels";
import { formatVnd } from "@/lib/format";
import { markCleanedAction, transitionAction } from "@/app/(app)/bookings/actions";

const COL = "2.5rem";
const LABEL_W = "8.5rem";
const DOW = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const STATUS_VI: Record<string, string> = { HOLDING: "Đang giữ phòng", CONFIRMED: "Đã xác nhận", CHECKED_IN: "Đang ở", CHECKED_OUT: "Đã trả phòng", CANCELLED: "Đã huỷ" };

const BLOCK: Record<MatrixBlock["status"], { cls: string; label: string }> = {
  BUSY: { cls: "bg-red-300 text-black", label: "Đã đặt" },
  HOLDING: { cls: "bg-status-holding text-black", label: "Đang giữ" },
  CROSS_LOCKED: { cls: "bg-cross-locked text-black", label: "Khóa chéo" },
  MINE: { cls: "bg-primary text-black", label: "" },
};

type Pick =
  | { kind: "free"; p: MatrixProperty; row: MatrixRow; date: string }
  | { kind: "booking"; p: MatrixProperty; d: BlockDetail };

const addDay = (iso: string, n: number) => new Date(new Date(`${iso}T00:00:00Z`).getTime() + n * 86_400_000).toISOString().slice(0, 10);

function Drawer({ onClose, title, children }: { onClose: () => void; title: string; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 md:items-stretch md:justify-end" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()} className="max-h-[85dvh] w-full space-y-3 overflow-y-auto rounded-t-lg border-2 border-black bg-white p-4 md:max-h-none md:w-96 md:rounded-none">
        <div className="flex items-start justify-between gap-2">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" aria-label="Đóng" onClick={onClose} className="grid size-9 shrink-0 place-items-center rounded border border-black"><X className="size-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function bookHref(p: MatrixProperty, row: MatrixRow, date: string, intent: "hold" | "instant") {
  const q = new URLSearchParams({ checkIn: date, checkOut: addDay(date, 1), intent });
  if (row.roomId) { q.set("type", "ROOMS"); q.append("rooms", row.roomId); } else q.set("type", p.allowWhole ? "WHOLE_UNIT" : "ROOMS");
  return `/broker/book/${p.id}?${q.toString()}`;
}

function BookingDrawer({ p, d, onClose }: { p: MatrixProperty; d: BlockDetail; onClose: () => void }) {
  const staff = p.role === "CO_HOST" || p.role === "CARETAKER";
  const tel = d.guestPhone?.replace(/[^\d+]/g, "");
  const doIt = (a: "CONFIRM" | "CHECK_IN" | "CHECK_OUT" | "CANCEL") => async () => { const r = await transitionAction(d.bookingId, a); if (!r.error) onClose(); return r; };
  return (
    <Drawer onClose={onClose} title={`${p.name} · ${d.code}`}>
      <dl className="space-y-1 text-sm">
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Khách</dt><dd className="font-semibold">{d.guestName} · {d.guestCount} khách</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Nhận → trả</dt><dd className="money-num font-semibold">{d.checkIn} → {d.checkOut}</dd></div>
        <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Trạng thái</dt><dd className="font-semibold">{STATUS_VI[d.status] ?? d.status}</dd></div>
        {d.total !== undefined && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Tổng tiền khách</dt><dd className="money-num font-semibold">{formatVnd(d.total)}</dd></div>}
        {d.remaining !== undefined && <div className="flex justify-between gap-3"><dt className="text-muted-foreground">Còn phải thu</dt><dd className="money-num text-base font-extrabold">{formatVnd(d.remaining)}</dd></div>}
      </dl>
      {tel && <a href={`tel:${tel}`} className="brutal-btn inline-flex h-11 w-full items-center justify-center gap-2 bg-white text-sm text-black"><Phone className="size-4" /> Gọi {d.guestPhone}</a>}
      {!staff && <Link href={`/broker/bookings/${d.bookingId}`} className="brutal-btn inline-flex h-11 w-full items-center justify-center bg-primary text-sm text-black">Mở chi tiết booking</Link>}
      {staff && (
        <div className="grid gap-2">
          {p.role === "CO_HOST" && d.status === "HOLDING" && <ActionButton action={doIt("CONFIRM")} className="h-11 w-full justify-center bg-primary">Xác nhận booking</ActionButton>}
          {d.status === "CONFIRMED" && <ActionButton action={doIt("CHECK_IN")} className="h-11 w-full justify-center bg-primary">✅ Check-in</ActionButton>}
          {d.status === "CHECKED_IN" && <ActionButton action={doIt("CHECK_OUT")} className="h-11 w-full justify-center bg-primary">🚪 Check-out</ActionButton>}
          {d.status === "CHECKED_OUT" && !d.cleaned && <ActionButton action={async () => { const r = await markCleanedAction(d.bookingId); if (!r.error) onClose(); return r; }} className="h-11 w-full justify-center bg-primary">🧹 Đã dọn phòng</ActionButton>}
          {d.status === "CHECKED_OUT" && d.cleaned && <p className="text-center text-sm font-semibold">🧹 Đã dọn phòng</p>}
          {p.role === "CO_HOST" && ["HOLDING", "CONFIRMED"].includes(d.status) && <ActionButton action={doIt("CANCEL")} confirm="Huỷ booking này?" className="h-11 w-full justify-center bg-destructive">Huỷ booking</ActionButton>}
        </div>
      )}
    </Drawer>
  );
}

function FreeDrawer({ p, row, date, onClose }: { p: MatrixProperty; row: MatrixRow; date: string; onClose: () => void }) {
  const canBook = p.role !== "CARETAKER";
  const btn = "brutal-btn inline-flex h-12 w-full items-center justify-center text-base font-semibold text-black";
  return (
    <Drawer onClose={onClose} title={`${p.name}${row.roomId ? ` · ${row.label}` : ""}`}>
      <p className="text-sm">Ngày trống: <b className="money-num">{date}</b> <span className="text-muted-foreground">(đặt 1 đêm, chỉnh số đêm ở bước sau)</span></p>
      {canBook ? (
        <div className="grid gap-2">
          {p.kind === "LINKED" && <Link href={bookHref(p, row, date, "hold")} className={`${btn} bg-white`}>⏱ Giữ phòng 30p</Link>}
          {p.instant && <Link href={bookHref(p, row, date, "instant")} className={`${btn} bg-primary`}>⚡ Đặt ngay</Link>}
          {!p.instant && p.kind === "LINKED" && <p className="text-xs text-muted-foreground">Chủ nhà chưa bật “đặt ngay” cho bạn — hãy giữ phòng 30 phút rồi chốt khi khách cọc.</p>}
        </div>
      ) : <p className="text-sm text-muted-foreground">Vai trò Quản gia không tạo booking.</p>}
    </Drawer>
  );
}

/** Lịch trống tổng quan: dòng = homestay (bấm mũi tên xổ phòng lẻ), cột = ngày từ hôm nay. Bấm ô trống để giữ phòng / đặt ngay, bấm ô có khách để xem. */
export function AvailabilityMatrix({ matrix, today }: { matrix: Matrix; today: string }) {
  const [open, setOpen] = useState<Record<string, boolean>>({});
  const [pick, setPick] = useState<Pick | null>(null);
  const n = matrix.days.length;
  const template = `${LABEL_W} repeat(${n}, ${COL})`;

  if (matrix.properties.length === 0) return <p className="text-muted-foreground">Chưa có homestay nào phù hợp. Xin cộng tác ở mục Khám phá, hoặc đổi bộ lọc.</p>;

  const renderRow = (p: MatrixProperty, row: MatrixRow, isRoom: boolean) => {
    const covered = new Set<number>();
    for (const b of row.blocks) for (let i = b.start; i < b.end; i++) covered.add(i);
    const minDay = p.role === "BROKER" ? today : p.role === "CARETAKER" ? addDay(today, -7) : null;
    return (
      <div key={row.key} className="grid" style={{ gridTemplateColumns: template }}>
        <div className={`sticky left-0 z-20 flex items-center gap-1 border-b border-r border-black bg-white px-2 text-sm ${isRoom ? "pl-6 text-xs" : "font-semibold"}`} style={{ minHeight: "2.5rem" }}>
          {!isRoom && p.rooms.length > 0 && (
            <button type="button" aria-label={open[p.id] ? "Thu gọn phòng" : "Xổ phòng lẻ"} aria-expanded={!!open[p.id]} onClick={() => setOpen((o) => ({ ...o, [p.id]: !o[p.id] }))} className="grid size-6 shrink-0 place-items-center rounded border border-black">
              {open[p.id] ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            </button>
          )}
          <span className="line-clamp-2 leading-tight">{row.label}</span>
        </div>
        {matrix.days.map((d, i) => {
          const blocked = covered.has(i);
          const past = !!minDay && d < minDay;
          const weekend = [5, 6].includes(new Date(`${d}T00:00:00Z`).getUTCDay());
          return blocked || past ? (
            <div key={d} style={{ gridColumn: i + 2, gridRow: 1 }} className={`border-b border-black/20 ${past ? "bg-muted/60" : ""}`} />
          ) : (
            <button key={d} type="button" aria-label={`${row.label} ngày ${d}: còn trống`} onClick={() => setPick({ kind: "free", p, row, date: d })}
              style={{ gridColumn: i + 2, gridRow: 1 }} className={`border-b border-r border-black/20 hover:bg-primary/40 ${weekend ? "bg-muted/40" : ""}`} />
          );
        })}
        {row.blocks.map((b) => {
          const st = BLOCK[b.status];
          const label = b.detail?.guestName ?? st.label;
          const cls = `z-10 m-0.5 overflow-hidden rounded border border-black px-1 text-left text-[11px] leading-tight font-semibold ${st.cls}`;
          const style = { gridColumn: `${b.start + 2} / ${b.end + 2}`, gridRow: 1 } as const;
          return b.detail ? (
            <button key={b.key} type="button" style={style} className={cls} onClick={() => setPick({ kind: "booking", p, d: b.detail! })} aria-label={`${label} ${b.detail.checkIn} đến ${b.detail.checkOut}`}>{label}</button>
          ) : (
            <div key={b.key} style={style} className={`${cls} flex items-center`} title={st.label}>{label}</div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 text-xs" aria-label="Chú thích">
        {(["BUSY", "HOLDING", "CROSS_LOCKED", "MINE"] as const).map((k) => (
          <span key={k} className="inline-flex items-center gap-1"><span className={`inline-block size-4 rounded border border-black ${BLOCK[k].cls}`} />{k === "MINE" ? "Đơn của bạn" : BLOCK[k].label}</span>
        ))}
        <span className="inline-flex items-center gap-1"><span className="inline-block size-4 rounded border border-black bg-white" />Còn trống (bấm để đặt)</span>
      </div>
      <div className="overflow-x-auto rounded border border-black bg-white" role="region" aria-label="Lịch trống các căn" tabIndex={0}>
        <div className="grid min-w-max" style={{ gridTemplateColumns: template }}>
          <div className="sticky left-0 z-30 border-b border-r border-black bg-white" />
          {matrix.days.map((d) => {
            const dt = new Date(`${d}T00:00:00Z`);
            return (
              <div key={d} className={`border-b border-r border-black/20 py-1 text-center text-[11px] leading-tight ${d === today ? "bg-primary font-bold" : [5, 6].includes(dt.getUTCDay()) ? "bg-muted/60" : ""}`}>
                <div>{DOW[dt.getUTCDay()]}</div><div className="money-num">{d.slice(8)}/{d.slice(5, 7)}</div>
              </div>
            );
          })}
        </div>
        {matrix.properties.map((p) => (
          <Fragment key={p.id}>
            <div className="min-w-max">
              {p.role !== "BROKER" && p.kind === "LINKED" && <div className="sticky left-0 w-fit bg-black px-2 py-0.5 text-[10px] font-bold text-white">{ACCESS_ROLE_LABEL[p.role]}</div>}
              {renderRow(p, p.row, false)}
              {open[p.id] && p.rooms.map((r) => renderRow(p, r, true))}
            </div>
          </Fragment>
        ))}
      </div>

      {pick?.kind === "free" && <FreeDrawer p={pick.p} row={pick.row} date={pick.date} onClose={() => setPick(null)} />}
      {pick?.kind === "booking" && <BookingDrawer p={pick.p} d={pick.d} onClose={() => setPick(null)} />}
    </div>
  );
}
