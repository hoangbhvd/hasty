// Test tích hợp Telegram / Web Push / webhook. Không gọi mạng thật (fetch & sender được giả lập).
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { createTelegramLinkToken, handleTelegramUpdate, sendTelegram } from "./telegram";
import { sendPush } from "./push";
import { notifyUsers } from "./notify";
import { POST as webhook } from "@/app/api/telegram/webhook/route";

const tag = `ntf${Date.now()}`;
let u1: string, u2: string;
const chat = (id: number, text: string, type = "private") => ({ message: { text, chat: { id, type } } });
const tgChat = async (id: string) => (await prisma.user.findUniqueOrThrow({ where: { id } })).telegramChatId;

before(async () => {
  process.env.TELEGRAM_BOT_TOKEN = "TEST-TOKEN";
  u1 = (await prisma.user.create({ data: { email: `${tag}-1@t.local`, fullName: "u1" } })).id;
  u2 = (await prisma.user.create({ data: { email: `${tag}-2@t.local`, fullName: "u2" } })).id;
});
after(async () => {
  await prisma.verification.deleteMany({ where: { identifier: { startsWith: "telegram-link:" }, value: { in: [u1, u2] } } });
  await prisma.pushSubscription.deleteMany({ where: { userId: { in: [u1, u2] } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("Telegram: /start <mã> gắn chat_id; mã chỉ dùng 1 lần", async () => {
  const t = await createTelegramLinkToken(u1);
  const r = await handleTelegramUpdate(chat(111, `/start ${t}`));
  assert.match(r!.reply, /Đã kết nối/);
  assert.equal(await tgChat(u1), "111");
  const again = await handleTelegramUpdate(chat(222, `/start ${t}`));
  assert.match(again!.reply, /hết hạn|đã dùng/);
  assert.equal(await tgChat(u1), "111"); // không bị đổi
});

test("Telegram: mã sai / hết hạn / chat nhóm / lệnh lạ đều bị từ chối an toàn", async () => {
  assert.match((await handleTelegramUpdate(chat(5, "/start not-a-token")))!.reply, /không hợp lệ/);
  assert.match((await handleTelegramUpdate(chat(5, "/start " + "a".repeat(32))))!.reply, /hết hạn|đã dùng/);
  const t = await createTelegramLinkToken(u2);
  await prisma.verification.updateMany({ where: { identifier: "telegram-link:" + t }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.match((await handleTelegramUpdate(chat(333, `/start ${t}`)))!.reply, /hết hạn/);
  assert.equal(await tgChat(u2), null);
  const t2 = await createTelegramLinkToken(u2);
  assert.equal(await handleTelegramUpdate(chat(444, `/start ${t2}`, "group")), null); // nhóm: bỏ qua
  assert.equal(await tgChat(u2), null);
  assert.match((await handleTelegramUpdate(chat(5, "hello")))!.reply, /\/start/);
  assert.equal(await handleTelegramUpdate({}), null);
});

test("Telegram: 1 chat chỉ thuộc 1 tài khoản (liên kết sang tài khoản mới sẽ gỡ tài khoản cũ); /stop tắt thông báo", async () => {
  const t = await createTelegramLinkToken(u2);
  await handleTelegramUpdate(chat(111, `/start ${t}`)); // chat 111 đang của u1
  assert.equal(await tgChat(u2), "111");
  assert.equal(await tgChat(u1), null);
  await handleTelegramUpdate(chat(111, "/stop"));
  assert.equal(await tgChat(u2), null);
});

test("Telegram: liên kết đồng thời cùng 1 mã → đúng 1 thắng", async () => {
  const t = await createTelegramLinkToken(u1);
  const res = await Promise.all([1, 2, 3, 4].map((i) => handleTelegramUpdate(chat(900 + i, `/start ${t}`)).then((r) => /Đã kết nối/.test(r!.reply))));
  assert.equal(res.filter(Boolean).length, 1);
  await prisma.user.updateMany({ where: { id: { in: [u1, u2] } }, data: { telegramChatId: null } });
});

test("sendTelegram: nút 'Mở' chỉ với https; http/localhost gắn link vào nội dung; thiếu token thì không gửi", async () => {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  const fake = (async (url: string, init: { body: string }) => { calls.push({ url, body: JSON.parse(init.body) }); return { ok: true }; }) as unknown as typeof fetch;

  assert.equal(await sendTelegram("42", "Xin chào", "https://app.example/host/bookings/1", fake), true);
  assert.match(calls[0].url, /api\.telegram\.org\/botTEST-TOKEN\/sendMessage/);
  assert.equal(calls[0].body.chat_id, "42");
  assert.deepEqual((calls[0].body.reply_markup as { inline_keyboard: { url: string }[][] }).inline_keyboard[0][0].url, "https://app.example/host/bookings/1");

  await sendTelegram("42", "Xin chào", "http://localhost:3000/x", fake);
  assert.equal(calls[1].body.reply_markup, undefined);
  assert.match(String(calls[1].body.text), /http:\/\/localhost:3000\/x/);

  const failing = (async () => { throw new Error("network down"); }) as unknown as typeof fetch;
  assert.equal(await sendTelegram("42", "x", undefined, failing), false); // lỗi mạng không ném ra ngoài

  delete process.env.TELEGRAM_BOT_TOKEN;
  assert.equal(await sendTelegram("42", "x", undefined, fake), false);
  assert.equal(calls.length, 2);
  process.env.TELEGRAM_BOT_TOKEN = "TEST-TOKEN";
});

test("Web Push: gửi tới mọi thiết bị; subscription chết (410) tự bị xoá; lỗi khác giữ lại", async () => {
  await prisma.pushSubscription.createMany({ data: [
    { userId: u1, endpoint: "https://push.example/ok", p256dh: "k", auth: "a" },
    { userId: u1, endpoint: "https://push.example/gone", p256dh: "k", auth: "a" },
    { userId: u1, endpoint: "https://push.example/flaky", p256dh: "k", auth: "a" },
  ] });
  const sent: string[] = [];
  const n = await sendPush(u1, { title: "t", body: "b", url: "/x" }, async (sub, payload) => {
    if (sub.endpoint.endsWith("/gone")) throw Object.assign(new Error("gone"), { statusCode: 410 });
    if (sub.endpoint.endsWith("/flaky")) throw Object.assign(new Error("5xx"), { statusCode: 500 });
    sent.push(sub.endpoint); assert.equal(JSON.parse(payload).body, "b");
  });
  assert.equal(n, 1);
  assert.deepEqual(sent, ["https://push.example/ok"]);
  const left = (await prisma.pushSubscription.findMany({ where: { userId: u1 } })).map((s) => s.endpoint.split("/").pop()).sort();
  assert.deepEqual(left, ["flaky", "ok"]);
  assert.equal(await sendPush(u2, { title: "t", body: "b" }, async () => { throw new Error("không được gọi"); }), 0);
});

test("notifyUsers: không ném lỗi khi Redis/Telegram/Push đều không khả dụng; id rỗng bị bỏ qua", async () => {
  process.env.TELEGRAM_BOT_TOKEN = "TEST-TOKEN"; // gọi mạng thật sẽ lỗi → phải được nuốt
  await prisma.user.update({ where: { id: u1 }, data: { telegramChatId: "1" } });
  await notifyUsers([u1, null, undefined, u1], "Kiểm thử", "/host");
  await notifyUsers([], "Không ai");
  await prisma.user.update({ where: { id: u1 }, data: { telegramChatId: null } });
});

const hook = (headers: Record<string, string>, body: unknown = chat(7, "hello")) =>
  webhook(new Request("http://x/api/telegram/webhook", { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) }));

test("webhook: chưa cấu hình secret → 503; sai secret → 403; đúng secret → 200", async () => {
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
  assert.equal((await hook({ "x-telegram-bot-api-secret-token": "anything" })).status, 503); // không bao giờ chấp nhận khi chưa có secret
  process.env.TELEGRAM_WEBHOOK_SECRET = "s3cret-value";
  assert.equal((await hook({})).status, 403);
  assert.equal((await hook({ "x-telegram-bot-api-secret-token": "wrong" })).status, 403);
  assert.equal((await hook({ "x-telegram-bot-api-secret-token": "s3cret-valuX" })).status, 403);
  assert.equal((await hook({ "x-telegram-bot-api-secret-token": "s3cret-value" })).status, 200);
  assert.equal((await hook({ "x-telegram-bot-api-secret-token": "s3cret-value" }, "rác")).status, 200);
  delete process.env.TELEGRAM_WEBHOOK_SECRET;
});

test("Telegram: lệnh /id trả về chat ID (để cấu hình ADMIN_TELEGRAM_CHAT_ID), chỉ trong chat riêng", async () => {
  const r = await handleTelegramUpdate(chat(123456789, "/id"));
  assert.match(r!.reply, /Chat ID của bạn: 123456789/);
  assert.equal(await handleTelegramUpdate(chat(-100, "/id", "group")), null);
});

test("sendTelegram: TELEGRAM_API_BASE cho phép trỏ tới máy chủ khác (dùng khi kiểm thử)", async () => {
  process.env.TELEGRAM_API_BASE = "http://fake-telegram:8081/";
  const urls: string[] = [];
  const fake = (async (u: string) => { urls.push(u); return { ok: true }; }) as unknown as typeof fetch;
  await sendTelegram("1", "x", undefined, fake);
  delete process.env.TELEGRAM_API_BASE;
  assert.equal(urls[0], "http://fake-telegram:8081/botTEST-TOKEN/sendMessage");
});
