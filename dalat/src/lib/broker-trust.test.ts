import { test } from "node:test";
import assert from "node:assert/strict";
import { badgeOf, completionOf, scoreOf } from "./broker-trust-core";

test("điểm: +10/đơn, +2/đêm, −15/đơn hủy, không âm", () => {
  assert.equal(scoreOf({ orders: 3, guests: 9, nights: 7, cancelledAfterConfirm: 0 }), 44);
  assert.equal(scoreOf({ orders: 3, guests: 9, nights: 7, cancelledAfterConfirm: 1 }), 29);
  assert.equal(scoreOf({ orders: 0, guests: 0, nights: 0, cancelledAfterConfirm: 4 }), 0);
});

test("huy hiệu theo ngưỡng 50 / 200", () => {
  assert.equal(badgeOf(0), "NEW"); assert.equal(badgeOf(49), "NEW");
  assert.equal(badgeOf(50), "ACTIVE"); assert.equal(badgeOf(199), "ACTIVE");
  assert.equal(badgeOf(200), "TOP");
});

test("tỷ lệ hoàn thành / hủy", () => {
  assert.deepEqual(completionOf({ orders: 0, cancelledAfterConfirm: 0 }), { completionRate: null, cancelRate: null });
  assert.deepEqual(completionOf({ orders: 3, cancelledAfterConfirm: 1 }), { completionRate: 0.75, cancelRate: 0.25 });
});
