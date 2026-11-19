import { test } from "node:test";
import assert from "node:assert/strict";
import { RULES, clear, clientIp, fail, hit, isBlocked, keyOf, memoryStore, resilientStore, waitText, type Store } from "./rate-limit";
import { validatePassword } from "./password-policy";
import { INTERNAL_EMAIL_DOMAIN, isRealEmail, sendMail } from "./mailer";

test("hit: cho phép tới đúng giới hạn rồi chặn kèm thời gian chờ; hết cửa sổ thì mở lại", async () => {
  let t = 1_000_000;
  const s = memoryStore(() => t);
  const rule = { limit: 3, windowSec: 60 };
  for (let i = 0; i < 3; i++) assert.equal((await hit("k", rule, s)).allowed, true);
  const v = await hit("k", rule, s);
  assert.equal(v.allowed, false);
  assert.ok(v.retryAfterSec > 0 && v.retryAfterSec <= 60);
  t += 61_000;
  assert.equal((await hit("k", rule, s)).allowed, true);
});

test("đăng nhập sai: chỉ chặn sau đủ N lần sai; thành công thì xoá bộ đếm; khoá riêng từng tài khoản", async () => {
  const s = memoryStore();
  const rule = { limit: 5, windowSec: 900 };
  const a = keyOf("login:id", "0912345678"), b = keyOf("login:id", "0999999999");
  for (let i = 0; i < 4; i++) { await fail(a, rule, s); assert.equal((await isBlocked(a, rule, s)).allowed, true); }
  await fail(a, rule, s);
  assert.equal((await isBlocked(a, rule, s)).allowed, false);
  assert.equal((await isBlocked(b, rule, s)).allowed, true); // người khác không bị ảnh hưởng
  await clear(a, s);
  assert.equal((await isBlocked(a, rule, s)).allowed, true);
});

test("khoá Redis được băm: không chứa SĐT/email dạng rõ; không phân biệt hoa thường/khoảng trắng", () => {
  const k = keyOf("login:id", "  User@Example.com ");
  assert.ok(!k.includes("example") && !k.includes("User"));
  assert.equal(k, keyOf("login:id", "user@example.com"));
  assert.notEqual(k, keyOf("login:ip", "user@example.com"));
});

test("Redis lỗi → tự dùng bộ nhớ dự phòng (vẫn giới hạn, không mở toang)", async () => {
  const broken: Store = { incr: async () => { throw new Error("down"); }, peek: async () => { throw new Error("down"); }, del: async () => { throw new Error("down"); } };
  const s = resilientStore(broken, memoryStore());
  const rule = { limit: 2, windowSec: 60 };
  await hit("x", rule, s); await hit("x", rule, s);
  assert.equal((await hit("x", rule, s)).allowed, false);
});

test("clientIp: ưu tiên X-Real-IP; X-Forwarded-For lấy phần tử CUỐI (chống client giả IP)", () => {
  const h = (o: Record<string, string>) => ({ get: (n: string) => o[n.toLowerCase()] ?? null });
  assert.equal(clientIp(h({ "x-real-ip": "1.2.3.4", "x-forwarded-for": "6.6.6.6, 9.9.9.9" })), "1.2.3.4");
  assert.equal(clientIp(h({ "x-forwarded-for": "6.6.6.6, 9.9.9.9" })), "9.9.9.9"); // phần giả do client gửi nằm đầu
  assert.equal(clientIp(h({})), "unknown");
});

test("thông báo chờ & bộ luật mặc định hợp lý", () => {
  assert.equal(waitText(40), "40 giây");
  assert.equal(waitText(600), "10 phút");
  assert.ok(RULES.loginFailPerAccount.limit <= 10 && RULES.loginFailPerIp.limit > RULES.loginFailPerAccount.limit);
});

test("chính sách mật khẩu: độ dài, phổ biến, lặp ký tự, toàn số", () => {
  assert.match(validatePassword("abc12")!, /8 ký tự/);
  assert.match(validatePassword("x".repeat(129))!, /128/);
  for (const bad of ["12345678", "Password", "matkhau123", "QWERTY123", "aaaaaaaa", "19900101", "00000000"]) assert.notEqual(validatePassword(bad), null, bad);
  assert.equal(validatePassword("1234567890123"), null); // 13 số: đủ dài
  for (const ok of ["Dalat-2026!x", "mat khau dai va kho doan", "tr0ub4dor&3"]) assert.equal(validatePassword(ok), null, ok);
});

test("chính sách mật khẩu: không chứa SĐT hoặc email của chính mình", () => {
  assert.match(validatePassword("xx0912345678xx", { phone: "0912345678" })!, /số điện thoại/);
  assert.match(validatePassword("nguyenvana2026", { email: "nguyenvana@gmail.com" })!, /email/);
  assert.equal(validatePassword("nguyenvana2026", { email: "a@gmail.com" }), null); // phần tên quá ngắn → bỏ qua
  assert.equal(validatePassword("Dalat-2026!x", { phone: "0912345678", email: "nguyenvana@gmail.com" }), null);
});

test("email nội bộ của tài khoản SĐT không được coi là email thật", () => {
  assert.equal(isRealEmail(`0912345678${INTERNAL_EMAIL_DOMAIN}`), false);
  assert.equal(isRealEmail("a@b.com"), true);
  assert.equal(isRealEmail(null), false);
});

test("sendMail: lỗi SMTP không ném ra ngoài; thiếu cấu hình thì không gửi", async () => {
  const sent: { to: string }[] = [];
  assert.equal(await sendMail("a@b.com", "s", "t", { sendMail: async (o) => { sent.push(o); } }), true);
  assert.equal(sent[0].to, "a@b.com");
  assert.equal(await sendMail("a@b.com", "s", "t", { sendMail: async () => { throw new Error("smtp down"); } }), false);
  delete process.env.SMTP_HOST;
  assert.equal(await sendMail("a@b.com", "s", "t"), false);
});
