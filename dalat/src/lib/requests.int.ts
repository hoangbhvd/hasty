// Test tích hợp bảng tin Tìm phòng gấp. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { addDays, todayVn } from "./format";
import { RequestError, chooseOffer, closeExpiredRequests, closeRequest, createOffer, createRoomRequest, listMyRequests, listRequestsForHost } from "./requests";
import { createBooking } from "./bookings";

const tag = `req${Date.now()}`;
const IN = addDays(todayVn(), 10), OUT = addDays(todayVn(), 12);
const base = (over = {}) => ({ checkIn: IN, checkOut: OUT, guestCount: 4, hoursValid: 24, ...over });

let hostA: string, hostB: string, hostC: string, broker: string, broker2: string;
let propA: string, propB: string, propC: string;

const rejects = (p: Promise<unknown>) => assert.rejects(p, RequestError);

before(async () => {
  const mk = (n: string) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n } });
  hostA = (await mk("hostA")).id; hostB = (await mk("hostB")).id; hostC = (await mk("hostC")).id;
  broker = (await mk("broker")).id; broker2 = (await mk("broker2")).id;
  // hostA: đã duyệt · hostB: chưa liên kết · hostC: bị chặn
  await prisma.hostBrokerLink.create({ data: { hostId: hostA, brokerId: broker, status: "APPROVED", allowInstantBook: true } });
  await prisma.hostBrokerLink.create({ data: { hostId: hostC, brokerId: broker, status: "BLOCKED" } });
  const mkProp = (hostId: string, name: string, extra = {}) =>
    prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-${name}`, area: "TUYEN_LAM", roadAccess: "CAR_16", baseWeekdayNet: 1_000_000, baseWeekendNet: 1_000_000, ...extra } });
  propA = (await mkProp(hostA, "A")).id; propB = (await mkProp(hostB, "B")).id; propC = (await mkProp(hostC, "C")).id;
});

after(async () => {
  const ids = [propA, propB, propC];
  await prisma.roomRequestOffer.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.roomRequest.deleteMany({ where: { brokerId: { in: [broker, broker2] } } });
  await prisma.message.deleteMany({ where: { conversation: { booking: { propertyId: { in: ids } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.property.deleteMany({ where: { id: { in: ids } } });
  await prisma.hostBrokerLink.deleteMany({ where: { brokerId: { in: [broker, broker2] } } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("tạo yêu cầu: kiểm tra đầu vào", async () => {
  await rejects(createRoomRequest(broker, base({ checkIn: addDays(todayVn(), -1), checkOut: IN })));
  await rejects(createRoomRequest(broker, base({ checkOut: IN })));
  await rejects(createRoomRequest(broker, base({ checkOut: addDays(IN, 31) })));
  await rejects(createRoomRequest(broker, base({ guestCount: 0 })));
  await rejects(createRoomRequest(broker, base({ area: "MARS" })));
  await rejects(createRoomRequest(broker, base({ roadAccess: "ROCKET" })));
  await rejects(createRoomRequest(broker, base({ maxBudget: -1 })));
  await rejects(createRoomRequest(broker, base({ hoursValid: 5 })));
});

test("yêu cầu chỉ tới Host đã duyệt + có căn trống khớp; Host chưa liên kết / bị chặn không thấy", async () => {
  const r = await createRoomRequest(broker, base({ area: "TUYEN_LAM", roadAccess: "CAR_7", maxBudget: 2_000_000 }));
  assert.equal(r.matchedHosts, 1);
  const a = await listRequestsForHost(hostA);
  assert.equal(a.length, 1);
  assert.equal(a[0].request.id, r.request.id);
  assert.equal(a[0].matches[0].propertyId, propA);
  assert.equal(a[0].brokerName, "broker");
  assert.equal((await listRequestsForHost(hostB)).length, 0); // chưa liên kết
  assert.equal((await listRequestsForHost(hostC)).length, 0); // bị chặn
  await closeRequest(broker, r.request.id);
});

test("tiêu chí không khớp (khu vực / ngân sách) → Host không thấy yêu cầu", async () => {
  const r1 = await createRoomRequest(broker, base({ area: "TRUNG_TAM" }));
  assert.equal(r1.matchedHosts, 0);
  const r2 = await createRoomRequest(broker, base({ maxBudget: 500_000 })); // Net 1tr/đêm > 500k
  assert.equal(r2.matchedHosts, 0);
  assert.equal((await listRequestsForHost(hostA)).length, 0);
  await closeRequest(broker, r1.request.id); await closeRequest(broker, r2.request.id);
});

test("ngày đã kín → không khớp; ngày trống thì khớp", async () => {
  const dates = { checkIn: addDays(todayVn(), 20), checkOut: addDays(todayVn(), 22) };
  await createBooking({ actorId: hostA, as: "HOST", propertyId: propA, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: new Date(`${dates.checkIn}T00:00:00Z`), checkOut: new Date(`${dates.checkOut}T00:00:00Z`), guestName: "K", guestCount: 1, guestTotalPrice: 1000 });
  const busy = await createRoomRequest(broker, base(dates));
  assert.equal(busy.matchedHosts, 0);
  const free = await createRoomRequest(broker, base());
  assert.equal(free.matchedHosts, 1);
  await closeRequest(broker, busy.request.id); await closeRequest(broker, free.request.id);
});

test("đề xuất: kiểm tra quyền, giá, căn khớp; gửi lại thì cập nhật chứ không nhân đôi", async () => {
  const { request } = await createRoomRequest(broker, base());
  await rejects(createOffer(hostB, request.id, propB, 900_000)); // chưa liên kết
  await rejects(createOffer(hostC, request.id, propC, 900_000)); // bị chặn
  await rejects(createOffer(hostA, request.id, propB, 900_000)); // căn của người khác
  await rejects(createOffer(hostA, request.id, propA, -1));
  await rejects(createOffer(hostA, request.id, propA, 1.5));
  await rejects(createOffer(hostA, "00000000-0000-4000-8000-000000000000", propA, 900_000));

  const o1 = await createOffer(hostA, request.id, propA, 900_000, "  Giá tốt  ");
  assert.equal(o1.note, "Giá tốt");
  const o2 = await createOffer(hostA, request.id, propA, 850_000);
  assert.equal(o2.id, o1.id);
  assert.equal(await prisma.roomRequestOffer.count({ where: { requestId: request.id } }), 1);
  assert.equal(Number((await prisma.roomRequestOffer.findUniqueOrThrow({ where: { id: o1.id } })).offeredNetPrice), 850_000);

  const mine = (await listMyRequests(broker)).find((r) => r.id === request.id)!;
  assert.equal(mine.offers.length, 1);
  assert.equal(mine.offers[0].host.fullName, "hostA");
  assert.equal((await listMyRequests(broker2)).length, 0); // CTV khác không thấy

  // chốt: chỉ CTV sở hữu; đóng yêu cầu; không chốt/đề xuất lại được
  await rejects(chooseOffer(broker2, o1.id));
  const pick = await chooseOffer(broker, o1.id);
  assert.deepEqual(pick, { propertyId: propA, checkIn: IN, checkOut: OUT });
  assert.equal((await prisma.roomRequest.findUniqueOrThrow({ where: { id: request.id } })).status, "CLOSED");
  await rejects(chooseOffer(broker, o1.id));
  await rejects(createOffer(hostA, request.id, propA, 800_000)); // đã đóng
});

test("đề xuất bị từ chối khi căn vừa bị đặt sau khi yêu cầu được tạo", async () => {
  const dates = { checkIn: addDays(todayVn(), 30), checkOut: addDays(todayVn(), 32) };
  const { request } = await createRoomRequest(broker, base(dates));
  await createBooking({ actorId: hostA, as: "HOST", propertyId: propA, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: new Date(`${dates.checkIn}T00:00:00Z`), checkOut: new Date(`${dates.checkOut}T00:00:00Z`), guestName: "K", guestCount: 1, guestTotalPrice: 1000 });
  await rejects(createOffer(hostA, request.id, propA, 900_000));
  await closeRequest(broker, request.id);
});

test("hết hạn: không còn hiện, không nhận đề xuất; worker đóng các yêu cầu quá hạn", async () => {
  const { request } = await createRoomRequest(broker, base());
  await prisma.roomRequest.update({ where: { id: request.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
  assert.equal((await listRequestsForHost(hostA)).filter((r) => r.request.id === request.id).length, 0);
  await rejects(createOffer(hostA, request.id, propA, 900_000));
  assert.ok((await closeExpiredRequests()) >= 1);
  assert.equal((await prisma.roomRequest.findUniqueOrThrow({ where: { id: request.id } })).status, "CLOSED");
  await rejects(closeRequest(broker, request.id)); // đã đóng
});

test("giới hạn chống spam: tối đa 10 yêu cầu đang mở", async () => {
  await prisma.roomRequest.deleteMany({ where: { brokerId: broker2 } });
  for (let i = 0; i < 10; i++) await createRoomRequest(broker2, base());
  await rejects(createRoomRequest(broker2, base()));
});
