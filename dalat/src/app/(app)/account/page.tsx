import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BankForm } from "@/components/bank-form";

export default async function AccountPage() {
  const u = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: u.id },
    select: { fullName: true, phone: true, email: true, bankId: true, bankAccountNo: true, bankAccountName: true },
  });
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Tài khoản</h1>
      <section className="space-y-1 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
        <div className="font-semibold">{me.fullName}</div>
        <div className="money-num text-sm text-muted-foreground">{me.phone ?? me.email}</div>
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Tài khoản nhận tiền</h2>
        <p className="text-sm text-muted-foreground">Dùng để tạo mã VietQR trên phiếu xác nhận gửi khách (CTV: khi booking do bạn bán; Chủ nhà: khi bạn tự bán).</p>
        <BankForm bankId={me.bankId ?? ""} accountNo={me.bankAccountNo ?? ""} accountName={me.bankAccountName ?? ""} />
      </section>
    </div>
  );
}
