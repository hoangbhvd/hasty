// Test tích hợp: CTV sửa homestay ngoài app. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { ExternalPropertyError, createExternalProperty, findOverlappingBookings, parseExternalInput, updateExternalProperty } from "./external-property";
import { createBooking } from "./bookings";

const tag = `ext${Date.now()}`;
let owner: string, other: string, host: string, extId: string, hostedId: string;
const rejects = (p: Promise<unknown> | (() => unknown)) => assert.rejects(async () => (typeof p === "function" ? p() : p), ExternalPropertyError);

before(async () => {
  const u = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  owner = (await u("owner")).id; other = (await u("other")).id; host = (await u("host")).id;
  hostedId = (await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-hosted` } })).id;
});
after(async () => {
  await prisma.message.deleteMany({ where: { conversation: { booking: { property: { name: { startsWith: tag } } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { property: { name: { startsWith: tag } } } } });
  await prisma.booking.deleteMany({ where: { property: { name: { startsWith: tag } } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

const form = (over: Record<string, string | undefined> = {}) => ({
  name: `${tag}-nha-go`, area: "TRUNG_TAM", externalHostName: "Cô Lan", externalHostPhone: "+84 933 444 555",
  baseWeekdayNet: "900000", baseWeekendNet: "1200000", googleMapsUrl: "https://maps.example/x", caretakerPhone: "", checkinGuide: "Rẽ phải", ...over,
});

test("tạo rồi sửa: các trường được cập nhật, SĐT chuẩn hoá, trường để trống thì xoá giá trị cũ", async () => {
  const p = await createExternalProperty(owner, parseExternalInput(form()));
  extId = p.id;
  assert.equal(p.sourceType, "BROKER_EXTERNAL");
  assert.equal(p.externalHostPhone, "0933444555");
  assert.equal(p.hostId, null);

  const u = await updateExternalProperty(owner, extId, parseExternalInput(form({
    name: `${tag}-nha-go-moi`, area: "TUYEN_LAM", baseWeekdayNet: "1000000", externalHostPhone: "0922 111 222", googleMapsUrl: "", checkinGuide: "",
  })));
  assert.equal(u.name, `${tag}-nha-go-moi`);
  assert.equal(u.area, "TUYEN_LAM");
  assert.equal(Number(u.baseWeekdayNet), 1_000_000);
  assert.equal(Number(u.baseWeekendNet), 1_200_000); // giữ nguyên vì form vẫn gửi giá trị cũ
  assert.equal(u.externalHostPhone, "0922111222");
  assert.equal(u.googleMapsUrl, null); // xoá khi để trống
  assert.equal(u.checkinGuide, null);
  assert.equal(u.sourceType, "BROKER_EXTERNAL"); // không đổi loại
  assert.equal(u.createdByBrokerId, owner);
});

test("chỉ CTV đã tạo mới sửa được; CTV khác, Host, hoặc căn của Host đều bị từ chối", async () => {
  await rejects(updateExternalProperty(other, extId, parseExternalInput(form())));
  await rejects(updateExternalProperty(host, extId, parseExternalInput(form())));
  await rejects(updateExternalProperty(owner, hostedId, parseExternalInput(form()))); // căn trên app của Host
  await rejects(updateExternalProperty(owner, "00000000-0000-4000-8000-000000000000", parseExternalInput(form())));
  assert.notEqual((await prisma.property.findUniqueOrThrow({ where: { id: hostedId } })).name, `${tag}-nha-go`); // căn Host không bị đụng
});

test("dữ liệu sai bị từ chối trước khi ghi (tên ngắn, link/SĐT sai, giá âm, khu vực lạ)", async () => {
  for (const bad of [{ name: "A" }, { googleMapsUrl: "khong-phai-link" }, { externalHostPhone: "abc" }, { baseWeekdayNet: "-5" }, { area: "MARS" }, { name: "" }]) {
    await rejects(() => parseExternalInput(form(bad)));
  }
  assert.equal((await prisma.property.findUniqueOrThrow({ where: { id: extId } })).name, `${tag}-nha-go-moi`);
});

test("sửa homestay không làm hỏng các booking đã có", async () => {
  const b = await createBooking({
    actorId: owner, as: "BROKER", propertyId: extId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
    checkIn: new Date("2035-01-01T00:00:00Z"), checkOut: new Date("2035-01-03T00:00:00Z"), guestName: "K", guestCount: 2,
    hostNetPrice: 1_000_000, guestTotalPrice: 1_300_000,
  });
  await updateExternalProperty(owner, extId, parseExternalInput(form({ name: `${tag}-doi-ten-lan-2`, baseWeekdayNet: "5" })));
  const after = await prisma.booking.findUniqueOrThrow({ where: { id: b.id } });
  assert.equal(Number(after.hostNetPrice), 1_000_000); // giá của booking cũ không đổi theo giá nền mới
  assert.equal(Number(after.guestTotalPrice), 1_300_000);
  assert.equal(after.status, "CONFIRMED");
});

test("cảnh báo trùng ngày: chỉ booking còn hiệu lực và thật sự giao nhau (đêm check-out không tính)", async () => {
  const mk = (inn: string, out: string) => createBooking({
    actorId: owner, as: "BROKER", propertyId: extId, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
    checkIn: new Date(`${inn}T00:00:00Z`), checkOut: new Date(`${out}T00:00:00Z`), guestName: "T", guestCount: 2,
    hostNetPrice: 1_000_000, guestTotalPrice: 1_200_000,
  });
  const a = await mk("2036-05-10", "2036-05-12");
  const gone = await mk("2036-05-20", "2036-05-22");
  await prisma.booking.update({ where: { id: gone.id }, data: { status: "CANCELLED" } });
  const d = (s: string) => new Date(`${s}T00:00:00Z`);
  assert.deepEqual((await findOverlappingBookings(extId, d("2036-05-11"), d("2036-05-13"))).map((x) => x.id), [a.id]);
  assert.equal((await findOverlappingBookings(extId, d("2036-05-12"), d("2036-05-14"))).length, 0); // nhận đúng ngày người trước trả
  assert.equal((await findOverlappingBookings(extId, d("2036-05-08"), d("2036-05-10"))).length, 0);
  assert.equal((await findOverlappingBookings(extId, d("2036-05-20"), d("2036-05-22"))).length, 0); // đã huỷ
});
