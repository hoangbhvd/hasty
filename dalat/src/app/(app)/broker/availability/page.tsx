import Link from "next/link";
import { requireUser } from "@/lib/session";
import { addDays, todayVn } from "@/lib/format";
import { AreaEnum } from "@/lib/validators";
import { MAX_DAYS, availabilityMatrix, earliestFor } from "@/lib/availability-matrix";
import { AvailabilityMatrix } from "@/components/availability-matrix";
import { Field, Select } from "@/components/form-fields";
import { Button } from "@/components/ui/button";
import { AREA_LABEL, ROAD_LABEL, enumOptions } from "@/lib/labels";

type SP = { from?: string; days?: string; area?: string; mode?: string; road?: string };

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const today = todayVn();
  const days = sp.days === "60" ? 60 : 30;
  const mode = sp.mode === "whole" || sp.mode === "rooms" ? sp.mode : undefined;
  const filter = { area: sp.area && AreaEnum.safeParse(sp.area).success ? sp.area : undefined, mode, road: sp.road || undefined } as const;
  const m = await availabilityMatrix(user.id, sp.from, days, filter);

  const qs = (over: Record<string, string | undefined>) => {
    const q = new URLSearchParams();
    const merged = { from: sp.from, days: String(days), area: sp.area, mode: sp.mode, road: sp.road, ...over };
    for (const [k, v] of Object.entries(merged)) if (v) q.set(k, v);
    return `/broker/availability?${q.toString()}`;
  };
  // Mốc sớm nhất xem được = nhỏ nhất theo vai trò của các căn hiện có (CTV: hôm nay; Quản gia: -7 ngày; Co-host: không giới hạn)
  const roles = new Set(m.properties.map((p) => p.role));
  const limits = [...roles].map((r) => earliestFor(r, today));
  const earliest = limits.length === 0 || limits.includes(null) ? null : limits.sort()[0]!;
  const canPrev = !earliest || m.from > earliest;
  const prev = earliest && addDays(m.from, -14) < earliest ? earliest : addDays(m.from, -14);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold">Lịch trống các căn</h1>
        <p className="text-sm text-muted-foreground">Từ hôm nay trở đi. Bấm ô trống để giữ phòng / đặt ngay; bấm mũi tên cạnh tên căn để xem từng phòng lẻ. Thông tin khách của đơn người khác không hiển thị.</p>
      </div>
      <form className="grid gap-3 rounded border border-black bg-white p-3 sm:grid-cols-4" action="/broker/availability">
        <input type="hidden" name="days" value={days} />
        <Field label="Khu vực" htmlFor="av-area"><Select id="av-area" name="area" defaultValue={sp.area ?? ""} options={[{ value: "", label: "Tất cả" }, ...enumOptions(AREA_LABEL)]} /></Field>
        <Field label="Hình thức" htmlFor="av-mode"><Select id="av-mode" name="mode" defaultValue={sp.mode ?? ""} options={[{ value: "", label: "Tất cả" }, { value: "whole", label: "Nguyên căn" }, { value: "rooms", label: "Phòng lẻ" }]} /></Field>
        <Field label="Xe vào được" htmlFor="av-road"><Select id="av-road" name="road" defaultValue={sp.road ?? ""} options={[{ value: "", label: "Bất kỳ" }, ...enumOptions(ROAD_LABEL)]} /></Field>
        <div className="flex items-end"><Button type="submit" className="h-11 w-full">Lọc</Button></div>
      </form>
      <div className="flex flex-wrap items-center gap-2">
        {canPrev ? <Link href={qs({ from: prev })} className="brutal-btn inline-flex h-10 items-center bg-white px-3 text-sm text-black">← 14 ngày trước</Link> : <span className="inline-flex h-10 items-center px-3 text-sm text-muted-foreground">← Không xem được quá khứ</span>}
        <Link href={qs({ from: undefined })} className="brutal-btn inline-flex h-10 items-center bg-white px-3 text-sm text-black">Hôm nay</Link>
        <Link href={qs({ from: addDays(m.from, 14) })} className="brutal-btn inline-flex h-10 items-center bg-white px-3 text-sm text-black">14 ngày sau →</Link>
        <Link href={qs({ days: days === 30 ? "60" : "30" })} className="brutal-btn inline-flex h-10 items-center bg-white px-3 text-sm text-black">{days === 30 ? `Xem ${MAX_DAYS} ngày` : "Xem 30 ngày"}</Link>
      </div>
      <AvailabilityMatrix matrix={m} today={today} />
    </div>
  );
}
