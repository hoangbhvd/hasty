"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BANK_IDS } from "@/lib/banks";
import type { FormState } from "@/app/(auth)/actions";

const schema = z.object({
  bankId: z.string().refine((v) => v === "" || BANK_IDS.includes(v), "Ngân hàng không hợp lệ"),
  bankAccountNo: z.string().trim().regex(/^(\d{6,20})?$/, "Số tài khoản chỉ gồm 6–20 chữ số"),
  bankAccountName: z.string().trim().max(50, "Tên tối đa 50 ký tự"),
});

export async function updateBankAction(_: FormState, fd: FormData): Promise<FormState> {
  const user = await requireUser();
  const p = schema.safeParse({
    bankId: String(fd.get("bankId") ?? ""),
    bankAccountNo: String(fd.get("bankAccountNo") ?? "").replace(/\s/g, ""),
    bankAccountName: String(fd.get("bankAccountName") ?? ""),
  });
  if (!p.success) return { error: p.error.issues[0].message };
  const { bankId, bankAccountNo, bankAccountName } = p.data;
  if (bankId && (!bankAccountNo || !bankAccountName)) return { error: "Nhập đủ số tài khoản và tên chủ tài khoản" };

  await prisma.user.update({
    where: { id: user.id },
    data: bankId
      ? { bankId, bankAccountNo, bankAccountName: bankAccountName.toUpperCase() }
      : { bankId: null, bankAccountNo: null, bankAccountName: null },
  });
  revalidatePath("/account");
  return {};
}
