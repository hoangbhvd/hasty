"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field, Select } from "@/components/form-fields";
import { BANKS } from "@/lib/banks";
import { useSafeForm } from "@/lib/use-safe-form";
import { updateBankAction } from "@/app/(app)/account/actions";

export function BankForm({ bankId, accountNo, accountName }: { bankId: string; accountNo: string; accountName: string }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(updateBankAction);
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-4">
      <Field label="Ngân hàng" htmlFor="bankId">
        <Select id="bankId" name="bankId" defaultValue={bankId} options={[{ value: "", label: "— Chưa thiết lập —" }, ...BANKS.map((b) => ({ value: b.id, label: `${b.name} (${b.id})` }))]} />
      </Field>
      <Field label="Số tài khoản" htmlFor="bankAccountNo"><Input id="bankAccountNo" name="bankAccountNo" inputMode="numeric" defaultValue={accountNo} className="h-11 text-base" /></Field>
      <Field label="Tên chủ tài khoản (không dấu)" htmlFor="bankAccountName"><Input id="bankAccountName" name="bankAccountName" defaultValue={accountName} className="h-11 text-base uppercase" /></Field>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      {state && !state.error && <p role="status" className="text-sm font-medium text-green-800">Đã lưu</p>}
      <Button type="submit" size="lg" className="h-12 w-full sm:w-auto" disabled={disabled}>{pending ? "Đang lưu…" : "Lưu tài khoản"}</Button>
    </form>
  );
}
