import Link from "next/link";
import { prisma } from "@/lib/db";
import type { Prisma } from "@/generated/prisma/client";
import { requireUser } from "@/lib/session";
import { buildQuote, fetchOccupying, specialRows } from "@/lib/bookings";
import { freeRoomIds, wholeUnitAvailable } from "@/lib/availability";
import { addDays, formatVnd, parseDateOnly, todayVn } from "@/lib/format";
import { AREA_LABEL, ROAD_LABEL, SLOPE_LABEL, enumOptions } from "@/lib/labels";
import { AreaEnum } from "@/lib/validators";
import { Field, Select } from "@/components/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

type SP = { checkIn?: string; checkOut?: string; guests?: string; area?: string; road?: string; slope?: string; maxNet?: string; bbq?: string; ac?: string; pet?: string; karaoke?: string };

const ROAD_ORDER = ["MOTORBIKE", "CAR_7", "CAR_16", "BUS_29"] as const;
const SLOPE_ORDER = ["FLAT", "MILD_SLOPE", "STEEP"] as const;

export default async function SearchPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const user = await requireUser();
  const checkIn = sp.checkIn ? parseDateOnly(sp.checkIn) : null;
  const checkOut = sp.checkOut ? parseDateOnly(sp.checkOut) : null;
  const searched = !!(checkIn && checkOut && checkOut > checkIn);
  const guests = Math.max(Number(sp.guests) || 0, 0);
  const maxNet = Number(sp.maxNet) || 0;

  const filters: Prisma.PropertyWhereInput[] = [];
  if (sp.area && AreaEnum.safeParse(sp.area).success) filters.push({ area: sp.area as never });
  const roadIdx = ROAD_ORDER.indexOf(sp.road as never);
  if (roadIdx >= 0) filters.push({ roadAccess: { in: [...ROAD_ORDER.slice(roadIdx)] } });
  const slopeIdx = SLOPE_ORDER.indexOf(sp.slope as never);
  if (slopeIdx >= 0) filters.push({ slopeLevel: { in: [...SLOPE_ORDER.slice(0, slopeIdx + 1)] } });
  if (sp.bbq) filters.push({ amenities: { path: ["bbQ"], equals: true } });
  if (sp.ac) filters.push({ amenities: { path: ["ac"], equals: true } });
  if (sp.pet) filters.push({ amenities: { path: ["pet_friendly"], equals: true } });
  if (sp.karaoke) filters.push({ amenities: { path: ["karaoke"], equals: true } });

  type Result = { id: string; name: string; sub: string; external: boolean; whole?: { total: number; ok: boolean }; rooms?: { free: { id: string; name: string; maxGuests: number }[] }; href: string };
  const results: Result[] = [];

  if (searched) {
    const props = await prisma.property.findMany({
      where: {
        AND: [
          { OR: [
            { sourceType: "BROKER_EXTERNAL", createdByBrokerId: user.id },
            { sourceType: "HOST_MANAGED", host: { hostLinks: { some: { brokerId: user.id, status: "APPROVED", accessRole: { not: "CARETAKER" } } } } },
          ] },
          ...filters,
        ],
      },
      include: { rooms: { orderBy: { name: "asc" } }, host: { select: { fullName: true } } },
      orderBy: { name: "asc" },
    });
    const hosted = props.filter((p) => p.sourceType === "HOST_MANAGED");
    const occ = await fetchOccupying(prisma, hosted.map((p) => p.id), checkIn, checkOut);
    const links = await prisma.hostBrokerLink.findMany({ where: { brokerId: user.id, status: "APPROVED", accessRole: { not: "CARETAKER" } } });
    const nights = Math.round((checkOut.getTime() - checkIn.getTime()) / 86_400_000);
    const qs = `checkIn=${sp.checkIn}&checkOut=${sp.checkOut}`;

    for (const p of props) {
      if (p.sourceType === "BROKER_EXTERNAL") {
        results.push({ id: p.id, name: p.name, sub: `Ngoài app · ${AREA_LABEL[p.area]}${p.externalHostName ? ` · ${p.externalHostName}` : ""}`, external: true, href: `/broker/book/${p.id}?${qs}` });
        continue;
      }
      const tier = links.find((l) => l.hostId === p.hostId)?.tier ?? null;
      const specials = await specialRows(prisma, p.id, checkIn, checkOut);
      const o = occ.get(p.id) ?? [];
      const r: Result = { id: p.id, name: p.name, sub: `${AREA_LABEL[p.area]} · ${ROAD_LABEL[p.roadAccess]} · ${SLOPE_LABEL[p.slopeLevel]} · Chủ: ${p.host?.fullName ?? ""}`, external: false, href: `/broker/book/${p.id}?${qs}` };

      if (p.allowWholeUnit && wholeUnitAvailable(o)) {
        const q = buildQuote(p, specials, tier, checkIn, checkOut, "WHOLE_UNIT", []);
        if (q.missing.length === 0 && q.total > 0 && (!maxNet || q.total / nights <= maxNet)) r.whole = { total: q.total, ok: true };
      }
      if (p.allowIndividualRooms) {
        const free = new Set(freeRoomIds(o, p.rooms.map((x) => x.id)));
        const list = p.rooms.filter((x) => free.has(x.id));
        if (list.length > 0 && (!guests || list.reduce((s, x) => s + x.maxGuests, 0) >= guests)) r.rooms = { free: list };
      }
      if (r.whole || r.rooms) results.push(r);
    }
  }

  const defaultIn = sp.checkIn ?? addDays(todayVn(), 1);
  return (
    <div className="space-y-5">
      <h1 className="text-2xl font-semibold">Tìm phòng trống</h1>
      <form method="GET" className="space-y-4 rounded border border-black bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Check-in" htmlFor="checkIn"><Input id="checkIn" name="checkIn" type="date" min={todayVn()} defaultValue={defaultIn} className="h-11 text-base" required /></Field>
          <Field label="Check-out" htmlFor="checkOut"><Input id="checkOut" name="checkOut" type="date" min={todayVn()} defaultValue={sp.checkOut ?? addDays(defaultIn, 1)} className="h-11 text-base" required /></Field>
          <Field label="Số khách" htmlFor="guests"><Input id="guests" name="guests" type="number" min="1" inputMode="numeric" defaultValue={sp.guests} className="h-11 text-base" /></Field>
        </div>
        <details open={!!(sp.area || sp.road || sp.slope || sp.maxNet || sp.bbq || sp.ac || sp.pet || sp.karaoke)}>
          <summary className="cursor-pointer text-sm font-medium">Bộ lọc Đà Lạt</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Khu vực" htmlFor="area"><Select id="area" name="area" defaultValue={sp.area ?? ""} options={[{ value: "", label: "Tất cả" }, ...enumOptions(AREA_LABEL)]} /></Field>
            <Field label="Xe cần vào được" htmlFor="road"><Select id="road" name="road" defaultValue={sp.road ?? ""} options={[{ value: "", label: "Bất kỳ" }, ...enumOptions(ROAD_LABEL)]} /></Field>
            <Field label="Độ dốc tối đa" htmlFor="slope"><Select id="slope" name="slope" defaultValue={sp.slope ?? ""} options={[{ value: "", label: "Bất kỳ" }, ...enumOptions(SLOPE_LABEL)]} /></Field>
            <Field label="Net tối đa / đêm (đ)" htmlFor="maxNet"><Input id="maxNet" name="maxNet" type="number" min="0" step="1000" inputMode="numeric" defaultValue={sp.maxNet} className="h-11 text-base" /></Field>
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 sm:grid-cols-4">
            {([["bbq", "BBQ"], ["ac", "Máy lạnh"], ["pet", "Thú cưng"], ["karaoke", "Karaoke"]] as const).map(([k, l]) => (
              <label key={k} className="flex min-h-11 items-center gap-2 text-sm">
                <input type="checkbox" name={k} value="1" defaultChecked={!!sp[k]} className="size-5 accent-foreground" /> {l}
              </label>
            ))}
          </div>
        </details>
        <Button type="submit" className="h-11 w-full sm:w-auto">Tìm phòng</Button>
      </form>

      {searched && (
        results.length === 0 ? (
          <p className="text-muted-foreground">Không có căn nào còn trống với bộ lọc này.</p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
            {results.map((r) => (
              <li key={r.id} className="space-y-2 rounded border border-black bg-white shadow-brutal-sm md:brutal-card p-4">
                <div className="font-medium">{r.name}</div>
                <div className="text-sm text-muted-foreground">{r.sub}</div>
                {r.external && <p className="text-sm">Không kiểm tra lịch (ngoài hệ thống).</p>}
                {r.whole && <div className="money-num text-sm">Nguyên căn trống · Net <strong>{formatVnd(r.whole.total)}</strong></div>}
                {r.rooms && <div className="text-sm">Phòng lẻ trống: {r.rooms.free.map((x) => `${x.name} (${x.maxGuests} khách)`).join(", ")}</div>}
                <div className="flex flex-wrap gap-2 pt-1">
                  {(r.external || r.whole) && (
                    <Link href={r.href} className="inline-flex h-11 items-center brutal-btn bg-primary px-4 text-sm text-black">
                      {r.external ? "Tạo booking" : "Đặt nguyên căn"}
                    </Link>
                  )}
                  {r.rooms && (
                    <Link href={`${r.href}&type=ROOMS`} className="inline-flex h-11 items-center brutal-btn bg-white px-4 text-sm text-black">Chọn phòng lẻ</Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )
      )}
    </div>
  );
}
