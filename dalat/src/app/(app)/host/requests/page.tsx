import { requireUser } from "@/lib/session";
import { listRequestsForHost } from "@/lib/requests";
import { OfferForm } from "@/components/request-forms";
import { AREA_LABEL, ROAD_LABEL } from "@/lib/labels";
import { formatDateTimeVi, formatVnd } from "@/lib/format";

export default async function HostRequestsPage() {
  const user = await requireUser();
  const rows = await listRequestsForHost(user.id);
  const dmy = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Tìm phòng gấp</h1>
      <p className="text-sm text-muted-foreground">Yêu cầu từ CTV đã duyệt, chỉ hiện khi bạn có căn trống phù hợp.</p>
      {rows.length === 0 && <p className="text-muted-foreground">Hiện chưa có yêu cầu nào phù hợp với căn của bạn. 🎉</p>}
      {rows.map(({ request: r, brokerName, matches, offers }) => {
        const nights = Math.round((r.checkOut.getTime() - r.checkIn.getTime()) / 86_400_000);
        return (
          <article key={r.id} className="space-y-3 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
            <div>
              <div className="money-num font-bold">{dmy(r.checkIn)} → {dmy(r.checkOut)} · {nights} đêm · {r.guestCount} khách</div>
              <div className="text-sm text-muted-foreground">
                CTV {brokerName} · {[r.area ? AREA_LABEL[r.area] : null, r.roadAccess ? ROAD_LABEL[r.roadAccess] : null, r.maxBudget ? `Net ≤ ${formatVnd(r.maxBudget)}/đêm` : null].filter(Boolean).join(" · ") || "Không ràng buộc"}
                {r.note && <> · “{r.note}”</>}
                {r.expiresAt && <> · hết hạn {formatDateTimeVi(r.expiresAt)}</>}
              </div>
            </div>
            {matches.map((m) => {
              const offer = offers.find((o) => o.propertyId === m.propertyId);
              return (
                <div key={m.propertyId} className="space-y-1 rounded border border-black p-3">
                  <div className="font-semibold">{m.name}</div>
                  <div className="money-num text-sm text-muted-foreground">
                    {m.match.wholeAvailable ? `Nguyên căn trống${m.match.wholeNetPerNight ? ` · Net ${formatVnd(m.match.wholeNetPerNight)}/đêm` : ""}` : ""}
                    {m.match.wholeAvailable && m.match.freeRooms.length > 0 ? " · " : ""}
                    {m.match.freeRooms.length > 0 ? `Phòng trống: ${m.match.freeRooms.length}` : ""}
                  </div>
                  <OfferForm
                    requestId={r.id} propertyId={m.propertyId}
                    defaultPrice={m.match.wholeAvailable && m.match.wholeNetPerNight ? m.match.wholeNetPerNight * nights : null}
                    existing={offer ? { price: Number(offer.offeredNetPrice), note: offer.note } : null}
                  />
                </div>
              );
            })}
          </article>
        );
      })}
    </div>
  );
}
