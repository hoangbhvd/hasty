import Link from "next/link";
import { notFound } from "next/navigation";
import { Avatar } from "@/components/avatar";
import { prisma } from "@/lib/db";
import { getConversation, getMessages, listConversations, markRead, type ChatRole } from "@/lib/chat";
import { ChatView, type HoldOption, type MediaOption } from "@/components/chat-view";
import { formatDateTimeVi } from "@/lib/format";

const base = (r: ChatRole) => (r === "HOST" ? "/host" : "/broker");
const PREVIEW: Record<string, string> = { ACTION_HOLD_REQ: "⏱ Yêu cầu giữ phòng", ACTION_BILL_UPLOAD: "💸 Bill chuyển khoản", ACTION_MEDIA_PACK: "🖼 Bộ ảnh", ACTION_NET_PRICE_REQ: "🤝 Đề xuất giá Net", IMAGE: "🖼 Ảnh" };

export async function ChatListPage({ userId, viewer }: { userId: string; viewer: ChatRole }) {
  const all = await listConversations(userId);
  const convs = all.filter((c) => c.role === viewer);
  return (
    <div className="max-w-2xl space-y-4">
      <h1 className="text-2xl font-bold">Chat</h1>
      {convs.length === 0 ? (
        <p className="text-muted-foreground">
          Chưa có cuộc trò chuyện. {viewer === "HOST" ? "Mở “Đối tác” và bấm “Nhắn tin” ở CTV đã duyệt." : "Mở chi tiết homestay của chủ nhà đã duyệt để nhắn tin."}
        </p>
      ) : (
        <ul className="divide-y divide-black rounded border border-black bg-white shadow-brutal-sm md:brutal-card">
          {convs.map((c) => (
            <li key={c.id}>
              <Link href={`${base(viewer)}/chat/${c.id}`} className="flex items-center justify-between gap-3 p-3 hover:bg-muted">
                <div className="min-w-0">
                  <div className="font-semibold">{c.title}{c.bookingCode && <span className="font-mono text-xs font-normal text-muted-foreground"> · {c.bookingCode}</span>}</div>
                  <div className="truncate text-sm text-muted-foreground">{c.last ? (c.last.msgType === "TEXT" ? c.last.content : PREVIEW[c.last.msgType]) : "Chưa có tin nhắn"}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1">
                  {c.last && <span className="money-num text-[11px] text-muted-foreground">{formatDateTimeVi(c.last.createdAt)}</span>}
                  {c.unread > 0 && <span aria-label={`${c.unread} tin chưa đọc`} className="grid min-w-5 place-items-center rounded-full border border-black bg-primary px-1 text-xs font-bold">{c.unread}</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export async function ChatConversationPage({ userId, id, viewer }: { userId: string; id: string; viewer: ChatRole }) {
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const c = await getConversation(userId, id);
  if (!c || c.role !== viewer) notFound();
  await markRead(userId, id);
  const messages = await getMessages(userId, id);

  const props = viewer === "BROKER" || viewer === "HOST"
    ? await prisma.property.findMany({ where: { sourceType: "HOST_MANAGED", hostId: c.conv.hostId }, orderBy: { name: "asc" }, include: { rooms: { orderBy: { name: "asc" } } } })
    : [];
  const holdOptions: HoldOption[] = viewer === "BROKER"
    ? props.map((p) => ({ id: p.id, name: p.name, allowWhole: p.allowWholeUnit, allowRooms: p.allowIndividualRooms, rooms: p.rooms.map((r) => ({ id: r.id, name: r.name, maxGuests: r.maxGuests })) }))
    : [];
  let mediaOptions: MediaOption[] = [];
  if (viewer === "HOST" && props.length > 0) {
    const ids = props.map((p) => p.id);
    const [albums, generalCounts] = await Promise.all([
      prisma.propertyAlbum.findMany({ where: { propertyId: { in: ids } }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }], select: { id: true, name: true, propertyId: true, _count: { select: { media: true } } } }),
      prisma.propertyMedia.groupBy({ by: ["propertyId"], where: { propertyId: { in: ids }, albumId: null }, _count: { _all: true } }),
    ]);
    mediaOptions = props.map((p) => ({
      id: p.id, name: p.name,
      groups: [
        { key: "general", name: "Ảnh chung", count: generalCounts.find((g) => g.propertyId === p.id)?._count._all ?? 0 },
        ...albums.filter((a) => a.propertyId === p.id).map((a) => ({ key: a.id, name: a.name, count: a._count.media })),
      ].filter((g) => g.count > 0),
    })).filter((o) => o.groups.length > 0);
  }

  // Nút "Đề xuất giá Net" cho CTV: booking của căn chủ nhà, còn mặc cả được, chưa có đề xuất chờ
  let netOption: { bookingId: string; current: number; max: number } | null = null;
  if (viewer === "BROKER" && c.conv.bookingId) {
    const bk = await prisma.booking.findUnique({
      where: { id: c.conv.bookingId },
      select: { status: true, hostNetPrice: true, guestTotalPrice: true, netPriceNegotiationStatus: true, property: { select: { sourceType: true } } },
    });
    if (bk && bk.property.sourceType === "HOST_MANAGED" && ["HOLDING", "CONFIRMED", "CHECKED_IN"].includes(bk.status) && bk.netPriceNegotiationStatus !== "PENDING") {
      netOption = { bookingId: c.conv.bookingId, current: Number(bk.hostNetPrice), max: Number(bk.guestTotalPrice) };
    }
  }

  return (
    <div className="max-w-2xl space-y-3">
      <div>
        <Link href={`${base(viewer)}/chat`} className="text-sm text-muted-foreground">← Chat</Link>
        <div className="flex items-center gap-2"><Avatar name={c.other.fullName} url={c.other.avatarUrl} tone={viewer === "HOST" ? "broker" : "host"} size={36} /><h1 className="text-xl font-bold">{c.other.fullName}</h1></div>
        {c.conv.booking && <p className="font-mono text-xs text-muted-foreground">Booking {c.conv.booking.bookingCode} · {c.conv.booking.guestName}</p>}
      </div>
      <ChatView
        conversationId={id} role={viewer} myId={userId} initial={messages} holdOptions={holdOptions} mediaOptions={mediaOptions}
        netOption={netOption} bookingPath={c.conv.bookingId ? `${base(viewer)}/bookings/${c.conv.bookingId}` : null}
      />
    </div>
  );
}
