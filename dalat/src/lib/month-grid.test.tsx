import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MonthGrid } from "@/components/month-grid";

const d = (s: string) => new Date(`${s}T00:00:00Z`);

test("lịch tháng: T2 đầu tuần, booking hiện đủ các đêm và không hiện ở ngày check-out", () => {
  // 11/2026 bắt đầu vào Chủ nhật → 6 ô trống đầu
  const html = renderToStaticMarkup(
    <MonthGrid month="2026-11" today="2026-11-24" items={[{ id: "a", label: "Khách A", status: "CONFIRMED", checkIn: d("2026-11-10"), checkOut: d("2026-11-13") }]} />,
  );
  assert.equal((html.match(/Khách A/g) ?? []).length, 3 * 2); // 3 đêm × (text + title)
  assert.equal((html.match(/role="gridcell"/g) ?? []).length, 30);
  assert.ok(html.indexOf("T2") < html.indexOf("CN"));
});
