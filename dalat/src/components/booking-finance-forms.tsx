"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ActionButton } from "@/components/action-button";
import { Field, Select } from "@/components/form-fields";
import { useSafeForm } from "@/lib/use-safe-form";
import {
  addAddonAction, createTransactionAction, decideTransactionAction, deleteAddonAction, setExtraFeesAction,
} from "@/app/(app)/bookings/finance-actions";

const err = (m?: string) => m && <p role="alert" className="text-sm font-medium text-red-700">{m}</p>;

export function AddonForm({ bookingId }: { bookingId: string }) {
  const { state, disabled, pending, ref, onSubmit } = useSafeForm(addAddonAction.bind(null, bookingId), { resetOnSuccess: true });
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded border border-dashed border-black bg-white p-3">
      <h3 className="text-sm font-semibold">Thêm dịch vụ đi kèm</h3>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Dịch vụ" htmlFor="serviceName"><Input id="serviceName" name="serviceName" placeholder="Thuê xe máy" className="h-11 text-base" required /></Field>
        <Field label="Số lượng" htmlFor="quantity"><Input id="quantity" name="quantity" type="number" min="1" defaultValue={1} inputMode="numeric" className="h-11 text-base" required /></Field>
        <Field label="Giá bán / đơn vị (đ)" htmlFor="guestPrice"><Input id="guestPrice" name="guestPrice" type="number" min="0" step="1000" inputMode="numeric" className="h-11 text-base" required /></Field>
        <Field label="Giá Net / đơn vị (đ)" htmlFor="netPrice"><Input id="netPrice" name="netPrice" type="number" min="0" step="1000" inputMode="numeric" className="h-11 text-base" required /></Field>
      </div>
      {err(state?.error)}
      <Button type="submit" className="h-10" disabled={disabled}>{pending ? "Đang thêm…" : "+ Thêm dịch vụ"}</Button>
    </form>
  );
}

export function DeleteAddonButton({ bookingId, addonId }: { bookingId: string; addonId: string }) {
  return <ActionButton action={() => deleteAddonAction(bookingId, addonId)} confirm="Xoá dịch vụ này?" className="bg-destructive">Xoá</ActionButton>;
}

export function ExtraFeeForm({ bookingId, current }: { bookingId: string; current: number }) {
  const { state, disabled, pending, ref, onSubmit } = useSafeForm(setExtraFeesAction.bind(null, bookingId));
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3 rounded border border-dashed border-black bg-white p-3">
      <Field label="Phụ thu phát sinh khi check-out (đ)" htmlFor="extraFees" hint="Thuộc về chủ nhà, cộng vào số tiền khách phải trả">
        <Input id="extraFees" name="extraFees" type="number" min="0" step="1000" inputMode="numeric" defaultValue={current} className="h-11 text-base" required />
      </Field>
      {err(state?.error)}
      {state && !state.error && <p role="status" className="text-sm font-medium text-green-800">Đã lưu</p>}
      <Button type="submit" className="h-10" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu phụ thu"}</Button>
    </form>
  );
}

export function TransactionForm({
  bookingId, directions, types, r2Ready,
}: {
  bookingId: string;
  directions: { value: string; label: string }[];
  types: { value: string; label: string }[];
  r2Ready: boolean;
}) {
  const { state, disabled, pending, ref, onSubmit } = useSafeForm(createTransactionAction.bind(null, bookingId), { resetOnSuccess: true });
  const [billKey, setBillKey] = useState("");
  const [upload, setUpload] = useState<string>();
  const [uploadError, setUploadError] = useState<string>();

  async function pick(file: File | undefined) {
    setBillKey(""); setUploadError(undefined);
    if (!file) return;
    setUpload("Đang tải ảnh…");
    try {
      const res = await fetch("/api/media/presign", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "bill", bookingId, contentType: file.type, size: file.size }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Không tải được");
      const put = await fetch(j.uploadUrl, { method: "PUT", headers: { "Content-Type": file.type }, body: file });
      if (!put.ok) throw new Error("Tải lên R2 thất bại (kiểm tra CORS của bucket)");
      setBillKey(j.key);
      setUpload(`Đã tải: ${file.name}`);
    } catch (e) {
      setUpload(undefined);
      setUploadError(e instanceof Error ? e.message : "Lỗi tải ảnh");
    }
  }

  return (
    <form
      ref={ref}
      onSubmit={(e) => { onSubmit(e); setBillKey(""); setUpload(undefined); }}
      className="space-y-3 rounded border border-dashed border-black bg-white p-3"
    >
      <h3 className="text-sm font-semibold">Ghi nhận giao dịch</h3>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Ai → Ai" htmlFor="direction"><Select id="direction" name="direction" options={directions} /></Field>
        <Field label="Loại" htmlFor="txType"><Select id="txType" name="txType" options={types} /></Field>
        <Field label="Số tiền (đ)" htmlFor="amount"><Input id="amount" name="amount" type="number" min="1" step="1" inputMode="numeric" className="h-11 text-base" required /></Field>
      </div>
      <div className="space-y-1">
        <label className="text-sm font-medium" htmlFor="bill">Ảnh bill chuyển khoản (không bắt buộc)</label>
        <input id="bill" type="file" accept="image/jpeg,image/png,image/webp" disabled={!r2Ready} onChange={(e) => pick(e.target.files?.[0])} className="block w-full text-sm" />
        {!r2Ready && <p className="text-xs text-muted-foreground">Chưa cấu hình Cloudflare R2 nên chưa đính kèm ảnh được.</p>}
        {upload && <p className="text-xs">{upload}</p>}
        {err(uploadError)}
        <input type="hidden" name="billKey" value={billKey} />
      </div>
      {err(state?.error)}
      <Button type="submit" className="h-11" disabled={disabled || upload === "Đang tải ảnh…"}>{pending ? "Đang ghi…" : "Ghi giao dịch"}</Button>
    </form>
  );
}

export function TxDecision({ bookingId, txId }: { bookingId: string; txId: string }) {
  return (
    <div className="flex gap-2">
      <ActionButton action={() => decideTransactionAction(bookingId, txId, "CONFIRM")} className="bg-secondary">Xác nhận đã nhận</ActionButton>
      <ActionButton action={() => decideTransactionAction(bookingId, txId, "REJECT")} confirm="Từ chối giao dịch này?" className="bg-destructive">Từ chối</ActionButton>
    </div>
  );
}
