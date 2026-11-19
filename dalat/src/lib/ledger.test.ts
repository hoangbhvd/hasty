import { test } from "node:test";
import assert from "node:assert/strict";
import { ledger, type BookingFin, type TxLite } from "./ledger";
import { vietQrUrl } from "./vietqr";

const base: BookingFin = { guestTotalPrice: 3_800_000, hostNetPrice: 3_200_000, extraFees: 0, cancelled: false, hasHost: true, hasBroker: true };
const tx = (payer: TxLite["payerRole"], receiver: TxLite["receiverRole"], amount: number, status: TxLite["status"] = "CONFIRMED"): TxLite =>
  ({ payerRole: payer, receiverRole: receiver, amount, status });

test("chưa có giao dịch: khách còn phải trả đủ, Broker nợ Host toàn bộ Net", () => {
  const l = ledger(base, [], []);
  assert.equal(l.guestPayable, 3_800_000);
  assert.equal(l.guestRemaining, 3_800_000);
  assert.equal(l.commission, 600_000);
  assert.equal(l.owedToHost, 3_200_000);
  assert.equal(l.commissionRealized, 0);
});

test("khách trả hết cho Broker, Broker chuyển Net cho Host → hết nợ, hoa hồng đã nhận", () => {
  const l = ledger(base, [], [tx("GUEST", "BROKER", 3_800_000), tx("BROKER", "HOST", 3_200_000)]);
  assert.equal(l.guestRemaining, 0);
  assert.equal(l.owedToHost, 0);
  assert.equal(l.brokerCash, 600_000);
  assert.equal(l.commissionRealized, 600_000);
  assert.equal(l.commissionPending, 0);
});

test("khách trả hết cho Broker nhưng Broker CHƯA chuyển Host → Broker nợ Net, hoa hồng chưa tính là đã nhận", () => {
  const l = ledger(base, [], [tx("GUEST", "BROKER", 3_800_000)]);
  assert.equal(l.owedToHost, 3_200_000);
  assert.equal(l.commissionRealized, 600_000); // đang giữ 3.8tr, trừ 3.2tr phải trả Host = 0.6tr
  const l2 = ledger(base, [], [tx("GUEST", "BROKER", 1_000_000)]);
  assert.equal(l2.commissionRealized, 0); // giữ 1tr nhưng còn nợ Host 3.2tr
});

test("khách trả hết cho Host → Host nợ Broker hoa hồng; trả xong thì hết nợ", () => {
  let l = ledger(base, [], [tx("GUEST", "HOST", 3_800_000)]);
  assert.equal(l.owedToHost, -600_000);
  assert.equal(l.commissionRealized, 0);
  l = ledger(base, [], [tx("GUEST", "HOST", 3_800_000), tx("HOST", "BROKER", 600_000)]);
  assert.equal(l.owedToHost, 0);
  assert.equal(l.commissionRealized, 600_000);
});

test("cọc cho Host, phần còn lại cho Broker", () => {
  const l = ledger(base, [], [tx("GUEST", "HOST", 1_000_000), tx("GUEST", "BROKER", 2_800_000)]);
  assert.equal(l.guestPaid, 3_800_000);
  assert.equal(l.owedToHost, 2_200_000); // Broker cần chuyển Host 2.2tr
  assert.equal(l.commissionRealized, 600_000); // 2.8tr giữ − 2.2tr nợ = 0.6tr
});

test("giao dịch chưa duyệt / bị từ chối KHÔNG được tính", () => {
  const l = ledger(base, [], [tx("GUEST", "BROKER", 3_800_000, "PENDING_CONFIRM"), tx("BROKER", "HOST", 3_200_000, "REJECTED")]);
  assert.equal(l.guestPaid, 0);
  assert.equal(l.owedToHost, 3_200_000);
});

test("dịch vụ đi kèm và phụ thu: tách phần Host / Broker", () => {
  const l = ledger({ ...base, extraFees: 100_000 }, [{ quantity: 2, guestPrice: 150_000, netPrice: 100_000 }], []);
  assert.equal(l.addonsGuest, 300_000);
  assert.equal(l.addonsNet, 200_000);
  assert.equal(l.guestPayable, 3_800_000 + 100_000 + 300_000);
  assert.equal(l.hostEntitled, 3_200_000 + 200_000 + 100_000); // phụ thu thuộc Host
  assert.equal(l.commission, 600_000 + 100_000); // chênh lệch dịch vụ thuộc Broker
});

test("booking đã huỷ: không còn quyền lợi, tiền cọc Host giữ phải hoàn lại Broker", () => {
  const l = ledger({ ...base, cancelled: true }, [], [tx("GUEST", "HOST", 1_000_000)]);
  assert.equal(l.hostEntitled, 0);
  assert.equal(l.commission, 0);
  assert.equal(l.owedToHost, -1_000_000);
});

test("Host tự bán (không Broker): không có công nợ", () => {
  const l = ledger({ ...base, hasBroker: false, hostNetPrice: 3_800_000 }, [], [tx("GUEST", "HOST", 1_000_000)]);
  assert.equal(l.owedToHost, 0);
  assert.equal(l.guestRemaining, 2_800_000);
  assert.equal(l.commission, 0);
});

test("homestay ngoài app: hoa hồng thực nhận = tiền khách đã trả vượt phần Net", () => {
  const ext = { ...base, hasHost: false };
  assert.equal(ledger(ext, [], [tx("GUEST", "BROKER", 3_000_000)]).commissionRealized, 0);
  assert.equal(ledger(ext, [], [tx("GUEST", "BROKER", 3_500_000)]).commissionRealized, 300_000);
  assert.equal(ledger(ext, [], [tx("GUEST", "BROKER", 3_800_000)]).commissionRealized, 600_000);
});

test("hoàn tiền giữa 2 bên được tính vào tiền mặt", () => {
  const l = ledger(base, [], [tx("GUEST", "HOST", 1_000_000), tx("HOST", "BROKER", 1_000_000)]);
  assert.equal(l.hostCash, 0);
  assert.equal(l.owedToHost, 3_200_000);
});

test("VietQR: URL đúng định dạng, số tiền làm tròn, nội dung cắt ngắn", () => {
  const u = new URL(vietQrUrl({ bankId: "MB", accountNo: "0123 456 789", accountName: "NGUYEN VAN A", amount: 1_500_000.4, info: "DL-2611-889" }));
  assert.equal(u.origin + u.pathname, "https://img.vietqr.io/image/MB-0123456789-compact2.png");
  assert.equal(u.searchParams.get("amount"), "1500000");
  assert.equal(u.searchParams.get("addInfo"), "DL-2611-889");
  assert.equal(u.searchParams.get("accountName"), "NGUYEN VAN A");
  assert.equal(new URL(vietQrUrl({ bankId: "MB", accountNo: "1", amount: 0 })).search, "");
});
