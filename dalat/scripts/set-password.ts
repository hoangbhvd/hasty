// Quản trị viên đặt lại mật khẩu thủ công (cho tài khoản không có email thật / Telegram).
// Chạy trên VPS:
//   docker compose -f docker-compose.prod.yml --env-file .env exec web node_modules/.bin/tsx scripts/set-password.ts <SĐT|email> <mật khẩu mới>
import "dotenv/config";
import { prisma } from "../src/lib/db";
import { auth } from "../src/lib/auth";
import { normalizeIdentifier } from "../src/lib/account-security";
import { validatePassword } from "../src/lib/password-policy";

async function main() {
  const [, , rawId, password] = process.argv;
  if (!rawId || !password) { console.error("Dùng: set-password.ts <SĐT|email> <mật khẩu mới>"); process.exit(2); }
  const id = normalizeIdentifier(rawId);
  if (!id) { console.error("SĐT/email không hợp lệ"); process.exit(2); }
  const user = await prisma.user.findFirst({ where: id.kind === "phone" ? { phone: id.value } : { email: id.value }, select: { id: true, phone: true, email: true, fullName: true } });
  if (!user) { console.error("Không tìm thấy tài khoản"); process.exit(1); }
  const bad = validatePassword(password, user);
  if (bad) { console.error(bad); process.exit(2); }

  const hash = await (await auth.$context).password.hash(password);
  const r = await prisma.account.updateMany({ where: { userId: user.id, providerId: "credential" }, data: { password: hash } });
  if (r.count === 0) { console.error("Tài khoản này không đăng nhập bằng mật khẩu (có thể dùng Google)"); process.exit(1); }
  const s = await prisma.session.deleteMany({ where: { userId: user.id } }); // đăng xuất mọi thiết bị
  console.log(`Đã đặt lại mật khẩu cho ${user.fullName} (${user.phone ?? user.email}); đã đăng xuất ${s.count} phiên.`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
