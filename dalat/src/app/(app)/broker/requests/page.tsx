import { requireUser } from "@/lib/session";
import { listMyRequests } from "@/lib/requests";
import { NewRequestForm, CloseRequestButton, ChooseOfferButton } from "@/components/request-forms";
import { Badge } from "@/components/ui/badge";
import { AREA_LABEL, ROAD_LABEL } from "@/lib/labels";
import { formatDateTimeVi, formatVnd, todayVn } from "@/lib/format";

export default async function BrokerRequestsPage() {
  const user = await requireUser();
  const requests = await listMyRequests(user.id);
  const dmy = (d: Date) => d.toISOString().slice(0, 10).split("-").reverse().join("/");

  return (
    <div className="max-w-3xl space-y-6">
      <h1 className="text-2xl font-bold">Tìm phòng gấp</h1>
      <NewRequestForm minDate={todayVn()} />

      <section className="space-y-3">
        <h2 className="text-lg font-bold">Yêu cầu của tôi</h2>
        {requests.length === 0 && <p className="text-sm text-muted-foreground">Chưa có yêu cầu nào.</p>}
        {requests.map((r) => {
          const { open, expired } = r;
          return (
            <article key={r.id} className="space-y-2 rounded border border-black bg-white p-4 shadow-brutal-sm md:brutal-card">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="money-num font-bold">{dmy(r.checkIn)} → {dmy(r.checkOut)} · {r.guestCount} khách</div>
                <Badge tone={open ? "holding" : "neutral"}>{open ? "Đang mở" : expired && r.status === "OPEN" ? "Hết hạn" : "Đã đóng"}</Badge>
              </div>
              <div className="text-sm text-muted-foreground">
                {[r.area ? AREA_LABEL[r.area] : null, r.roadAccess ? ROAD_LABEL[r.roadAccess] : null, r.maxBudget ? `Net ≤ ${formatVnd(r.maxBudget)}/đêm` : null].filter(Boolean).join(" · ") || "Không ràng buộc"}
                {r.note && <> · “{r.note}”</>}
                {open && r.expiresAt && <> · hết hạn {formatDateTimeVi(r.expiresAt)}</>}
              </div>
              {r.offers.length === 0 ? <p className="text-sm">Chưa có đề xuất{open ? " — chủ nhà phù hợp đã được thông báo." : "."}</p> : (
                <ul className="divide-y divide-black/20 rounded border border-black">
                  {r.offers.map((o) => (
                    <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
                      <div>
                        <div className="font-semibold">{o.property.name} <span className="font-normal text-muted-foreground">· {o.host.fullName}</span></div>
                        <div className="money-num">Net cả kỳ: <b>{formatVnd(o.offeredNetPrice)}</b></div>
                        {o.note && <div className="text-muted-foreground">“{o.note}”</div>}
                      </div>
                      {open && <ChooseOfferButton id={o.id} />}
                    </li>
                  ))}
                </ul>
              )}
              {open && <CloseRequestButton id={r.id} />}
            </article>
          );
        })}
      </section>
    </div>
  );
}
