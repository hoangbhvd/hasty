import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MonthGrid } from "@/components/month-grid";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("lịch tháng: T2 đầu tuần; booking là MỘT thanh liền, vắt qua tuần thì tách thành 2 đoạn có mũi tên", () => {
  // 11/2026: ngày 1 là Chủ nhật → hàng đầu chỉ có ô 1 ở cột CN
  const html = renderToStaticMarkup(
    <MonthGrid month="2026-11" today="2026-11-24" items={[
      { id: "a", label: "Khách A", status: "CONFIRMED", checkIn: d("2026-11-10"), checkOut: d("2026-11-13") }, // 3 đêm cùng tuần
      { id: "b", label: "Khách B", status: "CONFIRMED", checkIn: d("2026-11-14"), checkOut: d("2026-11-17") }, // T7 14 → vắt sang tuần sau
    ]} />,
  );
  assert.equal((html.match(/Khách A/g) ?? []).length, 1);   // một thanh duy nhất
  assert.match(html, /grid-column:2 \/ 5/);                  // ngày 10–12 = cột T3…T5 (T2=9)
  assert.equal((html.match(/Khách B/g) ?? []).length, 2);   // 2 đoạn (tuần 14–15 và 16)
  assert.ok(html.includes("Khách B ›") && html.includes("‹ Khách B"));
  assert.ok(html.indexOf("T2") < html.indexOf("CN"));
});
