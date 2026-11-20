import { prisma } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { BankForm } from "@/components/bank-form";
import { PushCard, TelegramCard } from "@/components/notify-settings";
import { ChangeEmailForm, ChangePasswordForm, SessionsCard } from "@/components/security-forms";
import { isRealEmail } from "@/lib/mailer";
import { Avatar } from "@/components/avatar";
import { ImageUploader } from "@/components/image-uploader";
import { BrokerBioForm } from "@/components/broker-bio-form";
import { r2Configured } from "@/lib/r2";

export default async function AccountPage() {
  const u = await requireUser();
  const me = await prisma.user.findUniqueOrThrow({
    where: { id: u.id },
    select: { avatarUrl: true, brokerBio: true, isBroker: true, fullName: true, phone: true, email: true, bankId: true, bankAccountNo: true, bankAccountName: true, telegramChatId: true },
  });
  const sessions = await prisma.session.count({ where: { userId: u.id, expiresAt: { gt: new Date() } } });
  const recoverable = isRealEmail(me.email) || !!me.telegramChatId;
  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-bold">Tài khoản</h1>
      <section className="space-y-3 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
        <div className="flex items-center gap-3">
          <Avatar name={me.fullName} url={me.avatarUrl} size={64} />
          <div className="min-w-0">
            <div className="font-semibold">{me.fullName}</div>
            <div className="money-num text-sm text-muted-foreground">{me.phone ?? me.email}</div>
          </div>
        </div>
        <ImageUploader kind="avatar" label={me.avatarUrl ? "Đổi ảnh đại diện" : "Tải ảnh đại diện"} r2Ready={r2Configured()} />
        {me.isBroker && <BrokerBioForm bio={me.brokerBio ?? ""} />}
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Bảo mật</h2>
        {!recoverable && (
          <p role="alert" className="rounded border border-black bg-status-holding p-3 text-sm font-semibold">
            ⚠ Bạn chưa có email thật hoặc Telegram nên sẽ không tự đặt lại được mật khẩu khi quên. Hãy thêm email bên dưới hoặc kết nối Telegram.
          </p>
        )}
        <ChangePasswordForm />
        <ChangeEmailForm current={isRealEmail(me.email) ? me.email : null} />
        <SessionsCard count={sessions} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Thông báo</h2>
        <TelegramCard linked={!!me.telegramChatId} />
        <PushCard vapidKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} />
      </section>
      <section className="space-y-3">
        <h2 className="text-lg font-bold">Tài khoản nhận tiền</h2>
        <p className="text-sm text-muted-foreground">Dùng để tạo mã VietQR trên phiếu xác nhận gửi khách (CTV: khi booking do bạn bán; Chủ nhà: khi bạn tự bán).</p>
        <BankForm bankId={me.bankId ?? ""} accountNo={me.bankAccountNo ?? ""} accountName={me.bankAccountName ?? ""} />
      </section>
    </div>
  );
}
