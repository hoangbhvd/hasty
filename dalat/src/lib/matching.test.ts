import { test } from "node:test";
import assert from "node:assert/strict";
import { matchProperty, type Candidate, type Criteria } from "./matching";

const prop = (over: Partial<Candidate> = {}): Candidate => ({
  id: "p", area: "TUYEN_LAM_PRENN_MIMOSA", roadAccess: "CAR_16", allowWholeUnit: true, allowIndividualRooms: true,
  rooms: [{ id: "a", maxGuests: 2 }, { id: "b", maxGuests: 3 }], ...over,
});
const crit = (over: Partial<Criteria> = {}): Criteria => ({ area: null, roadAccess: null, guestCount: 4, maxBudgetPerNight: null, ...over });

test("không ràng buộc: nguyên căn trống → khớp", () => {
  const m = matchProperty(prop(), crit(), [], 3_000_000, 2)!;
  assert.equal(m.wholeAvailable, true);
  assert.equal(m.wholeNetPerNight, 1_500_000);
  assert.equal(m.freeRooms.length, 2);
});

test("khu vực: chỉ khớp đúng khu vực yêu cầu", () => {
  assert.ok(matchProperty(prop(), crit({ area: "TUYEN_LAM_PRENN_MIMOSA" }), [], 1, 1));
  assert.equal(matchProperty(prop(), crit({ area: "TRUNG_TAM" }), [], 1, 1), null);
});

test("xe vào được: căn đường lớn đáp ứng yêu cầu xe nhỏ, ngược lại thì không", () => {
  assert.ok(matchProperty(prop({ roadAccess: "BUS_29" }), crit({ roadAccess: "CAR_16" }), [], 1, 1));
  assert.ok(matchProperty(prop({ roadAccess: "CAR_16" }), crit({ roadAccess: "CAR_16" }), [], 1, 1));
  assert.equal(matchProperty(prop({ roadAccess: "CAR_7" }), crit({ roadAccess: "CAR_16" }), [], 1, 1), null);
  assert.equal(matchProperty(prop({ roadAccess: "MOTORBIKE" }), crit({ roadAccess: "CAR_7" }), [], 1, 1), null);
});

test("ngân sách/đêm: nguyên căn vượt ngân sách bị loại nhưng phòng lẻ vẫn có thể khớp", () => {
  const m = matchProperty(prop(), crit({ maxBudgetPerNight: 1_000_000 }), [], 4_000_000, 2)!; // 2tr/đêm > 1tr
  assert.equal(m.wholeAvailable, false);
  assert.equal(m.freeRooms.length, 2);
  assert.equal(matchProperty(prop({ allowIndividualRooms: false }), crit({ maxBudgetPerNight: 1_000_000 }), [], 4_000_000, 2), null);
  assert.equal(matchProperty(prop(), crit({ maxBudgetPerNight: 2_000_000 }), [], 4_000_000, 2)!.wholeAvailable, true); // đúng bằng ngân sách
});

test("chưa cấu hình giá Net: không loại theo ngân sách (không đủ dữ liệu để so)", () => {
  const m = matchProperty(prop(), crit({ maxBudgetPerNight: 1 }), [], null, 2)!;
  assert.equal(m.wholeAvailable, true);
  assert.equal(m.wholeNetPerNight, null);
});

test("có booking: nguyên căn bị chặn, còn phòng lẻ trống đủ chỗ thì vẫn khớp", () => {
  const occ = [{ bookingType: "ROOMS" as const, roomIds: ["a"] }];
  const m = matchProperty(prop(), crit({ guestCount: 3 }), occ, 1, 1)!;
  assert.equal(m.wholeAvailable, false);
  assert.deepEqual(m.freeRooms.map((r) => r.id), ["b"]); // b chứa 3 khách
});

test("phòng lẻ còn trống nhưng không đủ sức chứa → không khớp", () => {
  const occ = [{ bookingType: "ROOMS" as const, roomIds: ["b"] }];
  assert.equal(matchProperty(prop(), crit({ guestCount: 3 }), occ, 1, 1), null); // chỉ còn a (2 khách)
});

test("nguyên căn bị đặt → không phòng lẻ nào trống → không khớp", () => {
  assert.equal(matchProperty(prop(), crit(), [{ bookingType: "WHOLE_UNIT", roomIds: [] }], 1, 1), null);
});

test("căn không bán nguyên căn / không bán phòng lẻ được tôn trọng", () => {
  assert.equal(matchProperty(prop({ allowWholeUnit: false, allowIndividualRooms: false }), crit(), [], 1, 1), null);
  const only = matchProperty(prop({ allowWholeUnit: false }), crit(), [], 1, 1)!;
  assert.equal(only.wholeAvailable, false);
  assert.equal(only.freeRooms.length, 2);
});
