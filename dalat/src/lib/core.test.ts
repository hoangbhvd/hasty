import { test } from "node:test";
import assert from "node:assert/strict";
import { isWeekendNight, nightPrice, nightsBetween, quote } from "./pricing";
import { freeRoomIds, roomsAvailable, wholeUnitAvailable } from "./availability";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("weekend nights are Fri and Sat only", () => {
  assert.equal(isWeekendNight(d("2027-02-05")), true); // Fri
  assert.equal(isWeekendNight(d("2027-02-06")), true); // Sat
  assert.equal(isWeekendNight(d("2027-02-07")), false); // Sun
  assert.equal(isWeekendNight(d("2027-02-04")), false); // Thu
});

test("nights exclude check-out day", () => {
  assert.equal(nightsBetween(d("2027-02-05"), d("2027-02-08")).length, 3);
  assert.equal(nightsBetween(d("2027-02-05"), d("2027-02-05")).length, 0);
});

test("special price beats base; tier-specific beats generic", () => {
  const base = { weekday: 100, weekend: 200 };
  const sp = [
    { roomId: null, date: d("2027-02-05"), netPrice: 500, brokerTier: null },
    { roomId: null, date: d("2027-02-05"), netPrice: 450, brokerTier: "VIP" as const },
  ];
  assert.equal(nightPrice(base, sp, null, d("2027-02-05"), null), 500);
  assert.equal(nightPrice(base, sp, null, d("2027-02-05"), "VIP"), 450);
  assert.equal(nightPrice(base, sp, null, d("2027-02-05"), "AGENCY"), 500);
  assert.equal(nightPrice(base, sp, null, d("2027-02-06"), null), 200);
  // special của phòng không áp cho nguyên căn
  assert.equal(nightPrice(base, [{ roomId: "r1", date: d("2027-02-04"), netPrice: 9, brokerTier: null }], null, d("2027-02-04"), null), 100);
});

test("quote sums nights and reports missing prices", () => {
  const q = quote({
    checkIn: d("2027-02-04"), checkOut: d("2027-02-07"), tier: null, specials: [],
    whole: { name: "Villa", base: { weekday: 100, weekend: 200 } }, rooms: [],
  });
  assert.equal(q.total, 100 + 200 + 200);
  const m = quote({
    checkIn: d("2027-02-04"), checkOut: d("2027-02-05"), tier: null, specials: [], whole: null,
    rooms: [{ id: "a", name: "A", base: { weekday: 10, weekend: 20 } }, { id: "b", name: "B", base: { weekday: null, weekend: null } }],
  });
  assert.deepEqual(m.missing, ["B"]);
  assert.equal(m.total, 10);
});

test("cross-lock whole unit vs rooms", () => {
  assert.equal(wholeUnitAvailable([]), true);
  assert.equal(wholeUnitAvailable([{ bookingType: "ROOMS", roomIds: ["a"] }]), false);
  assert.equal(roomsAvailable([{ bookingType: "WHOLE_UNIT", roomIds: [] }], ["a"]), false);
  assert.equal(roomsAvailable([{ bookingType: "ROOMS", roomIds: ["a"] }], ["a", "b"]), false);
  assert.equal(roomsAvailable([{ bookingType: "ROOMS", roomIds: ["a"] }], ["b"]), true);
  assert.deepEqual(freeRoomIds([{ bookingType: "ROOMS", roomIds: ["a"] }], ["a", "b", "c"]), ["b", "c"]);
  assert.deepEqual(freeRoomIds([{ bookingType: "WHOLE_UNIT", roomIds: [] }], ["a", "b"]), []);
});
