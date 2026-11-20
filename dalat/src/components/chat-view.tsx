"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Modal } from "@/components/modal";
import { ActionButton } from "@/components/action-button";
import { Check, Field, Select } from "@/components/form-fields";
import { BillCard, HoldRequestCard, MediaPackCard, NetPriceCard } from "@/components/chat-cards";
import { getSocket } from "@/lib/socket-client";
import { useUnread } from "@/components/realtime-provider";
import { useSafeForm } from "@/lib/use-safe-form";
import { holdRequestAction, shareMediaAction } from "@/app/(app)/chat-actions";
import type { ChatRole, MessageDto } from "@/lib/chat";

export type HoldOption = { id: string; name: string; allowWhole: boolean; allowRooms: boolean; rooms: { id: string; name: string; maxGuests: number }[] };

const time = (iso: string) => new Intl.DateTimeFormat("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit", day: "2-digit", month: "2-digit" }).format(new Date(iso));

function HoldForm({ convId, options, onDone }: { convId: string; options: HoldOption[]; onDone: () => void }) {
  const { state, pending, disabled, ref, onSubmit } = useSafeForm(holdRequestAction.bind(null, convId));
  const [pid, setPid] = useState(options[0]?.id ?? "");
  const [type, setType] = useState<"WHOLE_UNIT" | "ROOMS">("WHOLE_UNIT");
  const p = options.find((o) => o.id === pid);
  const effType = p && !p.allowWhole ? "ROOMS" : p && !p.allowRooms ? "WHOLE_UNIT" : type;
  useEffect(() => { if (state && !state.error) onDone(); }, [state, onDone]);

  if (options.length === 0) return <p className="text-sm">Chủ nhà chưa có căn nào để giữ.</p>;
  return (
    <form ref={ref} onSubmit={onSubmit} className="space-y-3">
      <Field label="Căn" htmlFor="h-prop"><Select id="h-prop" name="propertyId" value={pid} onChange={(e) => setPid(e.target.value)} options={options.map((o) => ({ value: o.id, label: o.name }))} /></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Check-in" htmlFor="h-in"><Input id="h-in" name="checkIn" type="date" className="h-11 text-base" required /></Field>
        <Field label="Check-out" htmlFor="h-out"><Input id="h-out" name="checkOut" type="date" className="h-11 text-base" required /></Field>
      </div>
      {p?.allowWhole && p.allowRooms && (
        <Field label="Hình thức" htmlFor="h-type"><Select id="h-type" value={type} onChange={(e) => setType(e.target.value as "WHOLE_UNIT" | "ROOMS")} options={[{ value: "WHOLE_UNIT", label: "Nguyên căn" }, { value: "ROOMS", label: "Phòng lẻ" }]} /></Field>
      )}
      <input type="hidden" name="bookingType" value={effType} />
      {effType === "ROOMS" && p?.rooms.map((r) => <Check key={r.id} name="roomIds" label={`${r.name} · ${r.maxGuests} khách`} />)}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tên khách" htmlFor="h-name"><Input id="h-name" name="guestName" className="h-11 text-base" required /></Field>
        <Field label="Số khách" htmlFor="h-cnt"><Input id="h-cnt" name="guestCount" type="number" min="1" defaultValue={2} className="h-11 text-base" required /></Field>
      </div>
      {state?.error && <p role="alert" className="text-sm font-medium text-red-700">{state.error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={disabled}>{pending ? "Đang gửi…" : "Gửi yêu cầu giữ phòng 30p"}</Button>
    </form>
  );
}

export function ChatView({
  conversationId, role, myId, initial, holdOptions, mediaOptions, bookingPath,
}: {
  conversationId: string; role: ChatRole; myId: string; initial: MessageDto[];
  holdOptions: HoldOption[]; mediaOptions: { id: string; name: string }[]; bookingPath: string | null;
}) {
  const [messages, setMessages] = useState<MessageDto[]>(initial);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string>();
  const end = useRef<HTMLDivElement>(null);
  const { refreshUnread } = useUnread();

  const markRead = useCallback(() => {
    fetch(`/api/chat/${conversationId}/read`, { method: "POST" }).then(refreshUnread).catch(() => {});
  }, [conversationId, refreshUnread]);
  const reload = useCallback(async () => {
    const r = await fetch(`/api/chat/${conversationId}/messages`);
    if (r.ok) setMessages((await r.json()).messages);
  }, [conversationId]);

  useEffect(() => {
    const s = getSocket();
    markRead();
    const onMsg = (p: { conversationId: string; message: MessageDto }) => {
      if (p.conversationId !== conversationId) return;
      setMessages((cur) => (cur.some((m) => m.id === p.message.id) ? cur : [...cur, p.message]));
      markRead();
    };
    const onUpdate = () => { reload(); };
    s.on("chat:message", onMsg);
    s.on("chat:update", onUpdate);
    s.on("connect", onUpdate); // mất mạng rồi kết nối lại: lấy tin bị lỡ
    return () => { s.off("chat:message", onMsg); s.off("chat:update", onUpdate); s.off("connect", onUpdate); };
  }, [conversationId, markRead, reload]);

  useEffect(() => { end.current?.scrollIntoView({ block: "end" }); }, [messages.length]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const t = text.trim();
    if (!t || sending) return;
    setSending(true); setError(undefined);
    try {
      const r = await fetch(`/api/chat/${conversationId}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: t }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "Không gửi được");
      setMessages((cur) => (cur.some((m) => m.id === j.message.id) ? cur : [...cur, j.message]));
      setText("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Không gửi được");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-[calc(100dvh-13.5rem)] min-h-80 flex-col rounded border border-black bg-white md:h-[calc(100dvh-9rem)]">
      <div role="log" aria-live="polite" aria-label="Tin nhắn" className="flex-1 space-y-3 overflow-y-auto p-3">
        {messages.length === 0 && <p className="pt-8 text-center text-sm text-muted-foreground">Chưa có tin nhắn. Hãy gửi lời chào!</p>}
        {messages.map((m) => {
          const system = m.senderId === null && m.msgType === "TEXT";
          const mine = m.senderId === myId;
          if (system) return <p key={m.id} className="mx-auto max-w-sm text-center text-xs text-muted-foreground">{m.content} · {time(m.createdAt)}</p>;
          return (
            <div key={m.id} className={`flex flex-col ${mine ? "items-end" : "items-start"}`}>
              {!mine && m.senderName && <span className="px-1 text-[11px] text-muted-foreground">{m.senderName}</span>}
              {m.msgType === "TEXT" ? (
                <p className={`max-w-[85%] rounded border border-black px-3 py-2 text-sm break-words whitespace-pre-wrap ${mine ? "bg-primary" : "bg-muted"}`}>{m.content}</p>
              ) : m.msgType === "ACTION_HOLD_REQ" ? <HoldRequestCard m={m} role={role} />
              : m.msgType === "ACTION_BILL_UPLOAD" ? <BillCard m={m} role={role} />
              : m.msgType === "ACTION_MEDIA_PACK" ? <MediaPackCard m={m} role={role} />
              : m.msgType === "ACTION_NET_PRICE_REQ" ? <NetPriceCard m={m} role={role} />
              : null}
              <span className="money-num px-1 text-[10px] text-muted-foreground">{time(m.createdAt)}</span>
            </div>
          );
        })}
        <div ref={end} />
      </div>

      <div className="space-y-2 border-t border-black p-2">
        <div className="flex flex-wrap gap-2">
          {role === "BROKER" && <Modal trigger="⏱ Xin giữ phòng" title="Xin giữ phòng 30 phút">{(close) => <HoldForm convId={conversationId} options={holdOptions} onDone={close} />}</Modal>}
          {role === "HOST" && mediaOptions.length > 0 && (
            <Modal trigger="🖼 Gửi bộ ảnh" title="Gửi bộ ảnh cho CTV">
              {(close) => (
                <ul className="space-y-2">
                  {mediaOptions.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2 rounded border border-black p-2">
                      <span className="text-sm font-medium">{p.name}</span>
                      <ActionButton action={async () => { const r = await shareMediaAction(conversationId, p.id); if (!r.error) close(); return r; }} className="bg-primary">Gửi</ActionButton>
                    </li>
                  ))}
                </ul>
              )}
            </Modal>
          )}
          {bookingPath && <Link href={bookingPath} className="brutal-btn inline-flex h-11 items-center bg-white px-4 text-sm text-black">💸 Gửi bill / Chi tiết</Link>}
        </div>
        <form onSubmit={send} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} aria-label="Nhập tin nhắn" placeholder="Nhập tin nhắn…" maxLength={2000} className="h-11 flex-1 text-base" />
          <Button type="submit" className="h-11 px-4" disabled={sending || !text.trim()} aria-label="Gửi"><Send className="size-4" /></Button>
        </form>
        {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      </div>
    </div>
  );
}
