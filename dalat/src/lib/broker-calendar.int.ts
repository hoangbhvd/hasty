// Test tích hợp: lịch CTV theo homestay. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { calendarBlocks, calendarProperties, parseSelected, selectedParam } from "./broker-calendar";

const tag = `bcal${Date.now()}`;
const d = (s: string) => new Date(`${s}T00:00:00.000Z`);
let me: string, rival: string, host: string, extMine: string, extRival: string, linked: string, unlinked: string;

before(async () => {
  const u = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  me = (await u("me")).id; rival = (await u("rival")).id; host = (await u("host")).id;
  const other = (await u("host2")).id;
  await prisma.hostBrokerLink.create({ data: { hostId: host, brokerId: me, status: "APPROVED", allowInstantBook: true } });
  const prop = (data: object) => prisma.property.create({ data: data as never }).then((p) => p.id);
  extMine = await prop({ sourceType: "BROKER_EXTERNAL", createdByBrokerId: me, name: `${tag}-ext-mine` });
  extRival = await prop({ sourceType: "BROKER_EXTERNAL", createdByBrokerId: rival, name: `${tag}-ext-rival` });
  linked = await prop({ sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-linked` });
  unlinked = await prop({ sourceType: "HOST_MANAGED", hostId: other, name: `${tag}-unlinked` });
  const bk = (propertyId: string, brokerId: string, code: string, hostId: string | null) => prisma.booking.create({
    data: { bookingCode: `${tag}-${code}`, propertyId, brokerId, hostId, bookingType: "WHOLE_UNIT", checkIn: d("2034-03-10"), checkOut: d("2034-03-13"),
      guestName: `Khach-${code}`, guestCount: 1, status: "CONFIRMED", guestTotalPrice: 1_000_000, hostNetPrice: 800_000 },
  });
  await bk(linked, me, "mine", host);
  await bk(linked, rival, "rival", host); // người khác đặt cùng căn đã liên kết
  await bk(unlinked, rival, "unl", null);
  await bk(extRival, rival, "extr", null);
});
after(async () => {
  await prisma.booking.deleteMany({ where: { bookingCode: { startsWith: tag } } });
  await prisma.property.deleteMany({ where: { name: { startsWith: tag } } });
  await prisma.hostBrokerLink.deleteMany({ where: { brokerId: me } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("CTV chỉ thấy căn ngoài của mình + căn của chủ nhà đã duyệt", async () => {
  const names = (await calendarProperties(me)).map((p) => p.name).filter((n) => n.startsWith(tag));
  assert.deepEqual(names.sort(), [`${tag}-ext-mine`, `${tag}-linked`]);
});

test("lịch: booking của mình có tên khách, của người khác chỉ là 'kín' (không id, không tên); căn không được xem bị bỏ", async () => {
  const blocks = await calendarBlocks(me, [extMine, linked, unlinked, extRival], d("2034-03-01"), d("2034-04-01"), new Date());
  assert.equal(blocks.length, 2); // unlinked & extRival bị loại
  const own = blocks.find((b) => b.bookingId)!;
  assert.equal(own.guestName, "Khach-mine");
  const busy = blocks.find((b) => !b.bookingId)!;
  assert.equal(busy.guestName, null);
  assert.equal(busy.status, "BUSY");
  assert.ok(!JSON.stringify(blocks).includes("Khach-rival"));
});

test("không chọn căn nào → không có khối; chọn căn → chỉ khối của căn đó", async () => {
  assert.deepEqual(await calendarBlocks(me, [], d("2034-03-01"), d("2034-04-01"), new Date()), []);
  const only = await calendarBlocks(me, [extMine], d("2034-03-01"), d("2034-04-01"), new Date());
  assert.equal(only.length, 0);
});

test("tham số p: vắng = tất cả, '-' = không căn nào, danh sách = đúng các căn hợp lệ", () => {
  const all = [{ id: "a", name: "A", kind: "EXTERNAL" as const }, { id: "b", name: "B", kind: "LINKED" as const }];
  assert.deepEqual(parseSelected(undefined, all), ["a", "b"]);
  assert.deepEqual(parseSelected("-", all), []);
  assert.deepEqual(parseSelected("b,zzz", all), ["b"]);
  assert.equal(selectedParam(["a", "b"], all), undefined);
  assert.equal(selectedParam([], all), "-");
  assert.equal(selectedParam(["b"], all), "b");
});
