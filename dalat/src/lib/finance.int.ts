// Test tích hợp tài chính + voucher trên DB thật. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { createBooking } from "./bookings";
import { addAddon, bookingLedger, createTransaction, decideTransaction, deleteAddon, directionsFor, FinanceError, getBookingForParty, setExtraFees } from "./booking-finance";
import { getVoucherData, getVoucherQrUrl } from "./voucher";

const d = (s: string) => new Date(`${s}T00:00:00Z`);
const tag = `fin${Date.now()}`;
let hostId: string, brokerId: string, strangerId: string, hostedProp: string, extProp: string;
let hostedBookingId: string, hostedToken: string;

const NET = 3_217_000; // số "lạ" để dò rò rỉ trong JSON voucher
const GUEST = 3_900_000;
const ADDON_NET = 77_700;

before(async () => {
  const mk = (n: string, extra = {}) => prisma.user.create({ data: { email: `${tag}-${n}@t.local`, fullName: n, phone: `09${Math.floor(10000000 + Math.random() * 89999999)}`, ...extra } });
  hostId = (await mk("host", { bankId: "VCB", bankAccountNo: "111222333", bankAccountName: "HOST NGUYEN" })).id;
  brokerId = (await mk("broker", { bankId: "MB", bankAccountNo: "999888777", bankAccountName: "BROKER TRAN" })).id;
  strangerId = (await mk("stranger")).id;
  await prisma.hostBrokerLink.create({ data: { hostId, brokerId, status: "APPROVED" } });
  hostedProp = (await prisma.property.create({
    data: { sourceType: "HOST_MANAGED", hostId, name: `${tag}-villa`, baseWeekdayNet: NET / 2, baseWeekendNet: NET / 2, googleMapsUrl: "https://maps.example/x", caretakerPhone: "0900000000", checkinGuide: "Rẽ trái" },
  })).id;
  extProp = (await prisma.property.create({ data: { sourceType: "BROKER_EXTERNAL", createdByBrokerId: brokerId, name: `${tag}-ext` } })).id;

  const b = await createBooking({
    actorId: brokerId, as: "BROKER", propertyId: hostedProp, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
    checkIn: d("2033-02-01"), checkOut: d("2033-02-03"), guestName: "Khách Voucher", guestCount: 2, guestTotalPrice: GUEST,
  });
  hostedBookingId = b.id; hostedToken = b.voucherToken;
});

after(async () => {
  const ids = [hostedProp, extProp];
  await prisma.transaction.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.bookingAddon.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.message.deleteMany({ where: { conversation: { booking: { propertyId: { in: ids } } } } });
  await prisma.conversation.deleteMany({ where: { booking: { propertyId: { in: ids } } } });
  await prisma.booking.deleteMany({ where: { propertyId: { in: ids } } });
  await prisma.property.deleteMany({ where: { id: { in: ids } } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

const rejects = (p: Promise<unknown>) => assert.rejects(p, FinanceError);

// ───────────────────────── VOUCHER: KHÔNG ĐƯỢC LỘ DỮ LIỆU NỘI BỘ ─────────────────────────

test("voucher công khai: KHÔNG chứa giá Net, hoa hồng, net dịch vụ, id Host/Broker", async () => {
  await addAddon(brokerId, hostedBookingId, { serviceName: "Thuê xe máy", quantity: 1, guestPrice: 150_000, netPrice: ADDON_NET });
  const v = await getVoucherData(hostedToken);
  assert.ok(v);
  const json = JSON.stringify(v);

  for (const key of ["hostNet", "host_net", "commission", "netPrice", "net_price", "hostId", "brokerId", "owedToHost", "ledger", "bankAccount", "voucherToken"]) {
    assert.equal(json.toLowerCase().includes(key.toLowerCase()), false, `lộ khoá "${key}"`);
  }
  // Không lộ GIÁ TRỊ: Net căn, net dịch vụ, hoa hồng, số tài khoản, id người dùng
  for (const secret of [String(NET), String(ADDON_NET), String(GUEST - NET), "111222333", "999888777", hostId, brokerId]) {
    assert.equal(json.includes(secret), false, `lộ giá trị "${secret}"`);
  }
  // Nhưng phải có đủ thứ khách cần thấy
  assert.equal(v.roomTotal, GUEST);
  assert.equal(v.addons[0].guestPrice, 150_000);
  assert.equal(v.grandTotal, GUEST + 150_000);
  assert.equal(v.remaining, GUEST + 150_000);
  assert.equal(v.nights, 2);
  assert.equal(v.mapsUrl, "https://maps.example/x");
  assert.equal(v.caretakerPhone, "0900000000");
});

test("voucher: token sai / không phải UUID / rỗng → null", async () => {
  assert.equal(await getVoucherData("không-phải-uuid"), null);
  assert.equal(await getVoucherData("00000000-0000-4000-8000-000000000000"), null);
  assert.equal(await getVoucherData(""), null);
  assert.equal(await getVoucherData("' OR 1=1 --"), null);
  assert.equal(await getVoucherQrUrl("00000000-0000-4000-8000-000000000000"), null);
});

test("voucher: tiền đã trả chỉ tính giao dịch CONFIRMED của KHÁCH; QR trỏ về tài khoản của Broker", async () => {
  await createTransaction(brokerId, hostedBookingId, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 1_000_000 }); // tự xác nhận (Broker là bên nhận)
  await createTransaction(hostId, hostedBookingId, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 500_000 }); // Host ghi hộ → chờ Broker duyệt
  await createTransaction(brokerId, hostedBookingId, { direction: "BROKER>HOST", txType: "DEPOSIT", amount: 800_000 }); // nội bộ, không phải tiền khách

  const v = await getVoucherData(hostedToken);
  assert.equal(v!.paid, 1_000_000);
  assert.equal(v!.remaining, GUEST + 150_000 - 1_000_000);
  assert.equal(v!.hasQr, true);

  const u = new URL((await getVoucherQrUrl(hostedToken))!);
  assert.match(u.pathname, /MB-999888777-compact2\.png$/); // Broker, không phải Host (VCB)
  assert.equal(u.searchParams.get("amount"), String(v!.remaining));
  assert.equal(u.searchParams.get("addInfo"), v!.bookingCode);
});

test("voucher: huỷ booking → không còn QR; thanh toán đủ → không còn QR", async () => {
  const b = await createBooking({
    actorId: brokerId, as: "BROKER", propertyId: hostedProp, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [],
    checkIn: d("2033-03-01"), checkOut: d("2033-03-02"), guestName: "K", guestCount: 1, guestTotalPrice: GUEST,
  });
  assert.ok(await getVoucherQrUrl(b.voucherToken));
  await createTransaction(brokerId, b.id, { direction: "GUEST>BROKER", txType: "BALANCE", amount: GUEST });
  assert.equal(await getVoucherQrUrl(b.voucherToken), null);
  assert.equal((await getVoucherData(b.voucherToken))!.remaining, 0);
  await prisma.booking.update({ where: { id: b.id }, data: { status: "CANCELLED" } });
  assert.equal((await getVoucherData(b.voucherToken))!.status, "CANCELLED");
});

test("voucher: cấu hình sai/độc hại bị bỏ, dùng mặc định", async () => {
  await prisma.property.update({
    where: { id: hostedProp },
    data: { voucherConfig: { template_id: "HACK", branding: { primary_color: "red;} body{display:none", cover_image_url: "javascript:alert(1)", brand_name: "Cottown" }, blocks: { show_vietqr: "yes" } } },
  });
  const v = (await getVoucherData(hostedToken))!;
  assert.equal(v.config.template_id, "DALAT_BOUTIQUE");
  assert.equal(v.config.branding.primary_color, "#B08978");
  assert.equal(v.config.branding.cover_image_url, null);
  assert.equal(v.config.branding.brand_name, "Cottown");
  assert.equal(v.config.blocks.show_vietqr, true);
});

// ───────────────────────── GIAO DỊCH ─────────────────────────

test("giao dịch: bên nhận ghi → CONFIRMED ngay; bên khác ghi → PENDING; chỉ bên nhận duyệt được", async () => {
  const b = await createBooking({ actorId: brokerId, as: "BROKER", propertyId: hostedProp, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2033-04-01"), checkOut: d("2033-04-02"), guestName: "K", guestCount: 1, guestTotalPrice: GUEST });
  const own = await createTransaction(hostId, b.id, { direction: "BROKER>HOST", txType: "BALANCE", amount: 1000 });
  assert.equal(own.status, "CONFIRMED");
  assert.ok(own.confirmedAt);

  const pending = await createTransaction(brokerId, b.id, { direction: "BROKER>HOST", txType: "BALANCE", amount: 2000 });
  assert.equal(pending.status, "PENDING_CONFIRM");
  await rejects(decideTransaction(brokerId, pending.id, "CONFIRM")); // người chuyển không tự duyệt được
  await rejects(decideTransaction(strangerId, pending.id, "CONFIRM"));
  await decideTransaction(hostId, pending.id, "CONFIRM");
  await rejects(decideTransaction(hostId, pending.id, "REJECT")); // đã xử lý
  assert.equal((await prisma.transaction.findUniqueOrThrow({ where: { id: pending.id } })).status, "CONFIRMED");

  const rej = await createTransaction(brokerId, b.id, { direction: "BROKER>HOST", txType: "BALANCE", amount: 3000 });
  await decideTransaction(hostId, rej.id, "REJECT");
  const l = bookingLedger((await getBookingForParty(hostId, b.id))!.booking);
  assert.equal(l.hostCash, 3000); // 1000 + 2000; khoản bị từ chối không tính
});

test("giao dịch: duyệt đồng thời 2 lần → đúng 1 lần thành công", async () => {
  const b = await createBooking({ actorId: brokerId, as: "BROKER", propertyId: hostedProp, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2033-05-01"), checkOut: d("2033-05-02"), guestName: "K", guestCount: 1, guestTotalPrice: GUEST });
  const t = await createTransaction(brokerId, b.id, { direction: "BROKER>HOST", txType: "DEPOSIT", amount: 5000 });
  const res = await Promise.all([
    decideTransaction(hostId, t.id, "CONFIRM").then(() => "ok", () => "fail"),
    decideTransaction(hostId, t.id, "REJECT").then(() => "ok", () => "fail"),
    decideTransaction(hostId, t.id, "CONFIRM").then(() => "ok", () => "fail"),
  ]);
  assert.equal(res.filter((r) => r === "ok").length, 1, JSON.stringify(res));
});

test("giao dịch: sai loại/hướng, số tiền xấu, người ngoài đều bị từ chối", async () => {
  const id = hostedBookingId;
  await rejects(createTransaction(brokerId, id, { direction: "HOST>BROKER", txType: "DEPOSIT", amount: 1000 })); // cọc không đi từ Host → Broker
  await rejects(createTransaction(hostId, id, { direction: "GUEST>HOST", txType: "COMMISSION_SETTLEMENT", amount: 1000 }));
  for (const amount of [0, -5, 1.5, NaN, 99_999_999_999]) {
    await rejects(createTransaction(brokerId, id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount }));
  }
  await rejects(createTransaction(strangerId, id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 1000 }));
  await rejects(decideTransaction(strangerId, "00000000-0000-4000-8000-000000000000", "CONFIRM"));
});

test("Host tự bán (không Broker): không có hướng liên quan Broker", async () => {
  assert.deepEqual(directionsFor(true, false), ["GUEST>HOST", "HOST>GUEST"]); // + hoàn tiền cho khách
  assert.deepEqual(directionsFor(false, true), ["GUEST>BROKER", "BROKER>GUEST"]);
  assert.equal(directionsFor(true, true).length, 6);
  const b = await createBooking({ actorId: hostId, as: "HOST", propertyId: hostedProp, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2033-06-01"), checkOut: d("2033-06-02"), guestName: "OTA", guestCount: 1, guestTotalPrice: 2_000_000 });
  await rejects(createTransaction(hostId, b.id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 1000 }));
  const t = await createTransaction(hostId, b.id, { direction: "GUEST>HOST", txType: "DEPOSIT", amount: 1_000_000 });
  assert.equal(t.status, "CONFIRMED");
  const l = bookingLedger((await getBookingForParty(hostId, b.id))!.booking);
  assert.equal(l.owedToHost, 0);
  assert.equal(l.guestRemaining, 1_000_000);
});

test("căn ngoài app: Broker ghi giao dịch tự xác nhận; Host không thể xem", async () => {
  const b = await createBooking({ actorId: brokerId, as: "BROKER", propertyId: extProp, mode: "CONFIRM", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2033-07-01"), checkOut: d("2033-07-02"), guestName: "Ext", guestCount: 1, hostNetPrice: 800_000, guestTotalPrice: 1_000_000 });
  assert.equal((await createTransaction(brokerId, b.id, { direction: "GUEST>BROKER", txType: "DEPOSIT", amount: 900_000 })).status, "CONFIRMED");
  assert.equal(await getBookingForParty(hostId, b.id), null);
  assert.equal(await getBookingForParty(strangerId, b.id), null);
  assert.equal(bookingLedger((await getBookingForParty(brokerId, b.id))!.booking).commissionRealized, 100_000);
});

// ───────────────────────── DỊCH VỤ & PHỤ THU ─────────────────────────

test("dịch vụ đi kèm: kiểm tra đầu vào và quyền", async () => {
  const id = hostedBookingId;
  const ok = { serviceName: "Set BBQ", quantity: 2, guestPrice: 300_000, netPrice: 200_000 };
  await rejects(addAddon(strangerId, id, ok));
  await rejects(addAddon(brokerId, id, { ...ok, netPrice: 400_000 })); // Net > giá bán
  await rejects(addAddon(brokerId, id, { ...ok, quantity: 0 }));
  await rejects(addAddon(brokerId, id, { ...ok, serviceName: "  " }));
  const a = await addAddon(hostId, id, ok);
  await rejects(deleteAddon(strangerId, a.id));
  await deleteAddon(brokerId, a.id);
  assert.equal(await prisma.bookingAddon.count({ where: { id: a.id } }), 0);
});

test("phụ thu: Host ghi cho căn trên app; Broker không được; chỉ khi đã xác nhận; ảnh hưởng công nợ", async () => {
  const b = await createBooking({ actorId: brokerId, as: "BROKER", propertyId: hostedProp, mode: "HOLD", bookingType: "WHOLE_UNIT", roomIds: [], checkIn: d("2033-08-01"), checkOut: d("2033-08-03"), guestName: "K", guestCount: 1, guestTotalPrice: GUEST });
  await rejects(setExtraFees(hostId, b.id, 100_000)); // đang HOLDING
  await prisma.booking.update({ where: { id: b.id }, data: { status: "CHECKED_OUT", holdExpiresAt: null } });
  await rejects(setExtraFees(brokerId, b.id, 100_000));
  await rejects(setExtraFees(hostId, b.id, -1));
  await setExtraFees(hostId, b.id, 100_000);
  const l = bookingLedger((await getBookingForParty(hostId, b.id))!.booking);
  assert.equal(l.hostEntitled, NET + 100_000);
  assert.equal(l.commission, GUEST - NET); // phụ thu không tính vào hoa hồng
});
