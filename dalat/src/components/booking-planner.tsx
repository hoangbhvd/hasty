import { prisma } from "@/lib/db";
import { getBrokerVisibleProperty, getHostProperty } from "@/lib/access";
import { buildQuote, fetchOccupying, specialRows } from "@/lib/bookings";
import { freeRoomIds, roomsAvailable, wholeUnitAvailable } from "@/lib/availability";
import { formatVnd, parseDateOnly, todayVn } from "@/lib/format";
import { Field, Select } from "@/components/form-fields";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { BookingCreateForm } from "@/components/booking-create-form";

export type PlannerParams = { propertyId?: string; checkIn?: string; checkOut?: string; type?: string; rooms?: string[] };

/** Chọn căn/ngày/đối tượng → hiện tình trạng trống + giá → form tạo booking. */
export async function BookingPlanner({
  as, userId, basePath, properties, params,
}: {
  as: "HOST" | "BROKER";
  userId: string;
  basePath: string;
  properties: { id: string; name: string }[];
  params: PlannerParams;
}) {
  const propertyId = params.propertyId ?? properties[0]?.id;
  const visible = propertyId
    ? as === "HOST" ? await getHostProperty(userId, propertyId) : await getBrokerVisibleProperty(userId, propertyId)
    : null;
  const property = visible ? await prisma.property.findUnique({ where: { id: visible.id }, include: { rooms: { orderBy: { name: "asc" } } } }) : null;
  const external = property?.sourceType === "BROKER_EXTERNAL";

  const type: "WHOLE_UNIT" | "ROOMS" =
    params.type === "ROOMS" && property?.allowIndividualRooms ? "ROOMS" : "WHOLE_UNIT";
  const checkIn = params.checkIn ? parseDateOnly(params.checkIn) : null;
  const checkOut = params.checkOut ? parseDateOnly(params.checkOut) : null;
  const datesOk = !!(checkIn && checkOut && checkOut > checkIn);
  const roomIds = (params.rooms ?? []).filter((r) => property?.rooms.some((x) => x.id === r));

  let tier: "STANDARD" | "VIP" | "AGENCY" | null = null;
  if (property && as === "BROKER" && !external) {
    tier = (await prisma.hostBrokerLink.findFirst({ where: { hostId: property.hostId!, brokerId: userId, status: "APPROVED" } }))?.tier ?? null;
  }

  let result: React.ReactNode = null;
  if (property && datesOk) {
    const occ = external ? [] : (await fetchOccupying(prisma, [property.id], checkIn, checkOut)).get(property.id) ?? [];
    const targetType = external ? "WHOLE_UNIT" : type;
    const free = external
      ? true
      : type === "WHOLE_UNIT" ? wholeUnitAvailable(occ) : roomIds.length > 0 && roomsAvailable(occ, roomIds);
    const q = buildQuote(property, await specialRows(prisma, property.id, checkIn, checkOut), tier, checkIn, checkOut, targetType, roomIds);
    const quoteOk = q.missing.length === 0 && q.total > 0;

    result = (
      <section className="space-y-4 rounded-lg border bg-card p-4">
        {external ? (
          <p className="text-sm text-muted-foreground">Homestay ngoài hệ thống: không kiểm tra lịch trống.</p>
        ) : type === "ROOMS" && roomIds.length === 0 ? (
          <p className="text-sm text-muted-foreground">Chọn ít nhất một phòng ở trên rồi bấm “Kiểm tra”.</p>
        ) : free ? (
          <p role="status" className="font-medium text-green-700">✓ Còn trống {q.nights} đêm</p>
        ) : (
          <p role="alert" className="font-medium text-destructive">✗ Không còn trống: đã có booking hoặc đang được giữ.</p>
        )}

        {(external || free) && (type !== "ROOMS" || roomIds.length > 0 || external) && (
          <>
            {quoteOk ? (
              <div className="text-sm">
                <div>Giá Net: <strong>{formatVnd(q.total)}</strong> ({q.nights} đêm{tier ? ` · hạng ${tier}` : ""})</div>
              </div>
            ) : (
              <p className="text-sm text-amber-700">
                {q.missing.length ? `Chưa cấu hình giá Net cho: ${q.missing.join(", ")}.` : "Chưa có giá Net."}
                {as === "HOST" || external ? " Hãy nhập giá thủ công bên dưới." : " Liên hệ chủ nhà."}
              </p>
            )}
            {(as === "HOST" || external || quoteOk) && (
              <BookingCreateForm
                as={as} propertyId={property.id} bookingType={targetType} roomIds={roomIds}
                checkIn={params.checkIn!} checkOut={params.checkOut!}
                defaultGuestTotal={quoteOk ? q.total : undefined}
                external={!!external}
                canHold={as === "BROKER" && !external}
              />
            )}
          </>
        )}
      </section>
    );
  }

  // Phòng còn trống (gợi ý) khi chọn phòng lẻ
  let freeSet: Set<string> | null = null;
  if (property && datesOk && type === "ROOMS" && !external) {
    const occ = (await fetchOccupying(prisma, [property.id], checkIn, checkOut)).get(property.id) ?? [];
    freeSet = new Set(freeRoomIds(occ, property.rooms.map((r) => r.id)));
  }

  return (
    <div className="space-y-5">
      <form method="GET" action={basePath} className="space-y-4 rounded-lg border p-4">
        {properties.length > 1 ? (
          <Field label="Căn" htmlFor="propertyId">
            <Select id="propertyId" name="propertyId" defaultValue={propertyId} options={properties.map((p) => ({ value: p.id, label: p.name }))} />
          </Field>
        ) : (
          <input type="hidden" name="propertyId" value={propertyId ?? ""} />
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Check-in" htmlFor="checkIn"><Input id="checkIn" name="checkIn" type="date" min={as === "BROKER" && !external ? todayVn() : undefined} defaultValue={params.checkIn} className="h-11 text-base" required /></Field>
          <Field label="Check-out" htmlFor="checkOut"><Input id="checkOut" name="checkOut" type="date" defaultValue={params.checkOut} className="h-11 text-base" required /></Field>
        </div>
        {property && !external && property.allowWholeUnit && property.allowIndividualRooms && (
          <Field label="Hình thức" htmlFor="type">
            <Select id="type" name="type" defaultValue={type} options={[{ value: "WHOLE_UNIT", label: "Nguyên căn" }, { value: "ROOMS", label: "Phòng lẻ" }]} />
          </Field>
        )}
        {property && !external && !property.allowWholeUnit && <input type="hidden" name="type" value="ROOMS" />}
        {property && !external && (type === "ROOMS" || !property.allowWholeUnit) && (
          <fieldset>
            <legend className="mb-1 text-sm font-medium">Phòng</legend>
            <div className="grid gap-x-3 sm:grid-cols-2">
              {property.rooms.map((r) => {
                const taken = freeSet ? !freeSet.has(r.id) : false;
                return (
                  <label key={r.id} className="flex min-h-11 items-center gap-2 text-sm">
                    <input type="checkbox" name="rooms" value={r.id} defaultChecked={roomIds.includes(r.id)} className="size-5 accent-foreground" />
                    {r.name} · {r.maxGuests} khách {taken && <span className="text-destructive">(đã kín)</span>}
                  </label>
                );
              })}
            </div>
            {property.rooms.length === 0 && <p className="text-sm text-muted-foreground">Căn chưa có phòng lẻ.</p>}
          </fieldset>
        )}
        <Button type="submit" variant="outline" className="h-11">Kiểm tra</Button>
      </form>
      {!property && propertyId && <p role="alert" className="text-destructive">Không tìm thấy căn hoặc bạn chưa có quyền.</p>}
      {result}
    </div>
  );
}
