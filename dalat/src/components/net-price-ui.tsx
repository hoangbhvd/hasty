"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/action-button";
import { Field } from "@/components/form-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import { formatVnd } from "@/lib/format";
import { proposeNetPriceAction, respondNetPriceAction } from "@/app/(app)/net-price-actions";
import type { NetCardMeta } from "@/lib/net-negotiation";

/** CTV: gửi đề xuất sửa giá Net (mục 4.6). */
export function ProposeNetForm({ bookingId, current, max }: { bookingId: string; current: number; max: number }) {
  const [open, setOpen] = useState(false);
  const { state, disabled, pending, ref, onSubmit } = useSafeForm(proposeNetPriceAction.bind(null, bookingId), { resetOnSuccess: true });
  if (!open) return <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(true)}>✏️ Đề xuất sửa giá Net</Button>;
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded border border-dashed border-black bg-white p-3">
      <h3 className="text-sm font-semibold">Đề xuất sửa giá Net</h3>
      <p className="text-xs text-muted-foreground">Giá Net hiện tại {formatVnd(current)}. Giá bán cho khách ({formatVnd(max)}) không đổi, chỉ hoa hồng của bạn thay đổi sau khi chủ nhà đồng ý.</p>
      <Field label="Giá Net mong muốn (đ)" htmlFor="netPrice"><Input id="netPrice" name="netPrice" type="number" min="0" max={max} step="1" inputMode="numeric" className="h-11 text-base" required /></Field>
      <Field label="Lý do" htmlFor="reason"><Input id="reason" name="reason" maxLength={500} placeholder="Khách ở 2 đêm ngày thường, chị hỗ trợ giảm em 400k nhé" className="h-11 text-base" required /></Field>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      {state && !state.error && <p role="status" className="text-sm font-medium text-green-800">Đã gửi đề xuất cho chủ nhà.</p>}
      <div className="flex gap-2">
        <Button type="submit" className="h-10" disabled={disabled}>{pending ? "Đang gửi…" : "Gửi đề xuất"}</Button>
        <Button type="button" variant="outline" className="h-10" onClick={() => setOpen(false)}>Đóng</Button>
      </div>
    </form>
  );
}

/** Nút phản hồi: dùng chung cho thẻ chat và trang chi tiết booking. */
export function NetResponseButtons({ messageId, bookingId, meta, role }: { messageId: string; bookingId: string; meta: NetCardMeta; role: "HOST" | "BROKER" }) {
  const [counterOpen, setCounterOpen] = useState(false);
  const [price, setPrice] = useState("");
  const [err, setErr] = useState<string>();
  const responder = meta.proposedBy === "BROKER" ? "HOST" : "BROKER";
  if (meta.status !== "PENDING" || role !== responder) return null;
  return (
    <div className="space-y-2 pt-1">
      <div className="flex flex-wrap gap-2">
        <ActionButton action={() => respondNetPriceAction(messageId, bookingId, "ACCEPT")} confirm={`Đồng ý giá Net ${formatVnd(meta.proposed_net_price)}?`} className="bg-secondary">{role === "HOST" ? "Đồng ý" : "Chấp nhận"}</ActionButton>
        <ActionButton action={() => respondNetPriceAction(messageId, bookingId, "REJECT")} confirm="Từ chối đề xuất giá Net?" className="bg-destructive">Từ chối</ActionButton>
        {role === "HOST" && <button type="button" className="brutal-btn inline-flex h-9 items-center bg-white px-3 text-sm text-black" onClick={() => setCounterOpen((v) => !v)}>Đề xuất giá khác</button>}
      </div>
      {counterOpen && role === "HOST" && (
        <div className="flex flex-wrap items-center gap-2">
          <Input value={price} onChange={(e) => setPrice(e.target.value)} type="number" min="0" step="1" inputMode="numeric" placeholder="Giá Net chốt (đ)" aria-label="Giá Net chốt" className="h-10 w-44 text-base" />
          <ActionButton
            action={async () => { const r = await respondNetPriceAction(messageId, bookingId, "COUNTER", Number(price)); if (r?.error) setErr(r.error); else setCounterOpen(false); return r; }}
            className="bg-primary"
          >Gửi giá chốt</ActionButton>
        </div>
      )}
      {err && <p role="alert" className="text-sm font-medium text-red-700">{err}</p>}
    </div>
  );
}
