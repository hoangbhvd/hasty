// Test tích hợp bảo mật tài khoản (quên/đặt lại mật khẩu, khoá đăng nhập). Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { auth } from "./auth";
import { memoryStore, setStore } from "./rate-limit";
import { FORGOT_MESSAGE, loginBlocked, loginFailed, loginSucceeded, normalizeIdentifier, registerBlocked, requestReset, resetPassword } from "./account-security";

const tag = `sec${Date.now()}`;
const phone = `09${String(Date.now()).slice(-8)}`;
let userId: string;
const OLD = "Cu-Matkhau-2026!";
const IP = "10.0.0.1";

const tokenOf = async () => {
  const v = await prisma.verification.findFirst({ where: { identifier: { startsWith: "reset-password:" }, value: userId }, orderBy: { createdAt: "desc" } });
  return v?.identifier.slice("reset-password:".length) ?? null;
};
const verify = async (pw: string) => {
  const acc = await prisma.account.findFirstOrThrow({ where: { userId, providerId: "credential" } });
  return (await auth.$context).password.verify({ hash: acc.password!, password: pw });
};

before(async () => {
  setStore(memoryStore()); // không phụ thuộc Redis
  const hash = await (await auth.$context).password.hash(OLD);
  const u = await prisma.user.create({ data: { email: `${tag}@t.local`, fullName: "Sec User", phone } });
  userId = u.id;
  await prisma.account.create({ data: { accountId: u.id, providerId: "credential", userId: u.id, password: hash } });
});
after(async () => {
  setStore(undefined);
  await prisma.verification.deleteMany({ where: { value: userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.account.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("chuẩn hoá định danh: các cách viết SĐT/email cùng 1 khoá", () => {
  const a = normalizeIdentifier("+84 912 345 678"), b = normalizeIdentifier("0912345678"), c = normalizeIdentifier("84912345678");
  assert.deepEqual(a, b); assert.deepEqual(b, c);
  assert.deepEqual(normalizeIdentifier("  User@Mail.COM "), { kind: "email", value: "user@mail.com" });
  assert.equal(normalizeIdentifier("abc"), null);
  assert.equal(normalizeIdentifier("   "), null);
});

test("khoá đăng nhập: đủ 5 lần sai thì chặn kèm thời gian chờ; tài khoản khác không ảnh hưởng; thành công thì mở lại", async () => {
  const id = "0911111111";
  for (let i = 0; i < 4; i++) { await loginFailed(id, `1.1.1.${i}`); assert.equal(await loginBlocked(id, "9.9.9.9"), null); }
  await loginFailed(id, "1.1.1.9");
  const msg = await loginBlocked(id, "9.9.9.9");
  assert.match(msg!, /quá nhiều lần.*phút/);
  assert.equal(await loginBlocked("0922222222", "9.9.9.9"), null);
  await loginSucceeded(id);
  assert.equal(await loginBlocked(id, "9.9.9.9"), null);
});

test("khoá theo IP: 1 IP thử sai trên nhiều tài khoản khác nhau cũng bị chặn", async () => {
  const ip = "7.7.7.7";
  for (let i = 0; i < 30; i++) await loginFailed(`09000000${String(i).padStart(2, "0")}`, ip);
  assert.match((await loginBlocked("0933333333", ip))!, /quá nhiều lần/);
  assert.equal(await loginBlocked("0933333333", "8.8.8.8"), null);
});

test("đăng ký: tối đa 10 lần / giờ / IP", async () => {
  for (let i = 0; i < 10; i++) assert.equal(await registerBlocked("5.5.5.5"), null);
  assert.match((await registerBlocked("5.5.5.5"))!, /quá nhiều lần/);
  assert.equal(await registerBlocked("5.5.5.6"), null);
});

test("quên mật khẩu: tài khoản có / không tồn tại cho CÙNG một phản hồi (không lộ tài khoản)", async () => {
  const exist = await requestReset(phone, IP);
  const missing = await requestReset("0900000001", IP);
  assert.deepEqual(exist, missing);
  assert.equal(exist.message, FORGOT_MESSAGE);
  assert.ok(await tokenOf(), "tài khoản tồn tại phải có token");
  assert.equal(await prisma.verification.count({ where: { value: "0900000001" } }), 0);
  assert.deepEqual(await requestReset("khong-hop-le", IP), { error: "Nhập SĐT hoặc email hợp lệ" });
});

test("quên mật khẩu: giới hạn 3 lần / giờ / tài khoản (kể cả dùng cách viết SĐT khác nhau)", async () => {
  setStore(memoryStore());
  const forms = [phone, `+84${phone.slice(1)}`, `${phone.slice(0, 4)} ${phone.slice(4)}`];
  for (const f of forms) assert.ok(!(await requestReset(f, `2.2.2.${forms.indexOf(f)}`)).error);
  const r = await requestReset(phone, "2.2.2.9");
  assert.match(r.error!, /quá nhiều lần/);
});

test("đặt lại mật khẩu: mật khẩu yếu bị từ chối và KHÔNG làm cháy token", async () => {
  setStore(memoryStore());
  await requestReset(phone, IP);
  const t = (await tokenOf())!;
  for (const weak of ["12345678", "short", phone, `x${phone}x`, "password"]) {
    const r = await resetPassword(t, weak, IP);
    assert.equal(r.ok, false, weak);
  }
  assert.equal(await prisma.verification.count({ where: { identifier: `reset-password:${t}` } }), 1); // token còn nguyên
  assert.equal(await verify(OLD), true); // mật khẩu chưa đổi
});

test("đặt lại mật khẩu: token hợp lệ → đổi được, token chỉ dùng 1 lần, mọi phiên bị đăng xuất", async () => {
  setStore(memoryStore());
  await requestReset(phone, IP);
  const t = (await tokenOf())!;
  await prisma.session.createMany({ data: [1, 2].map((i) => ({ userId, token: `${tag}-s${i}`, expiresAt: new Date(Date.now() + 3600_000) })) });

  const NEW = "Moi-Matkhau-2027#";
  for (let i = 0; i < 5; i++) await loginFailed(phone, "4.4.4.4"); // đang bị khoá đăng nhập
  assert.notEqual(await loginBlocked(phone, "4.4.4.9"), null);
  assert.deepEqual(await resetPassword(t, NEW, IP), { ok: true });
  assert.equal(await verify(NEW), true);
  assert.equal(await verify(OLD), false); // mật khẩu cũ hết hiệu lực
  assert.equal(await loginBlocked(phone, "4.4.4.9"), null); // đặt lại thành công → gỡ khoá đăng nhập
  assert.equal(await prisma.session.count({ where: { userId } }), 0); // đăng xuất mọi thiết bị

  const again = await resetPassword(t, "Khac-Matkhau-2028$", IP);
  assert.equal(again.ok, false); // dùng lại token
  assert.equal(await verify(NEW), true);
});

test("đặt lại mật khẩu: token hết hạn / giả / sai định dạng đều bị từ chối", async () => {
  setStore(memoryStore());
  await requestReset(phone, IP);
  const t = (await tokenOf())!;
  await prisma.verification.updateMany({ where: { identifier: `reset-password:${t}` }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await resetPassword(t, "Het-Han-Matkhau9!", IP)).ok, false);
  assert.equal((await resetPassword("a".repeat(32), "Gia-Matkhau-123!", IP)).ok, false);
  for (const bad of ["", "../../etc", "a b", "x".repeat(300), "' OR 1=1 --"]) assert.equal((await resetPassword(bad, "Gia-Matkhau-123!", IP)).ok, false);
});

test("đặt lại mật khẩu: giới hạn 20 lần / giờ / IP (chống dò token)", async () => {
  setStore(memoryStore());
  for (let i = 0; i < 20; i++) await resetPassword("a".repeat(32), "Gia-Matkhau-123!", "3.3.3.3");
  const r = await resetPassword("a".repeat(32), "Gia-Matkhau-123!", "3.3.3.3");
  assert.equal(r.ok, false);
  assert.match((r as { error: string }).error, /quá nhiều lần/);
});
