"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/modal";
import { ActionButton } from "@/components/action-button";
import { Button } from "@/components/ui/button";
import { cancelCollabAction, requestCollabAction } from "@/app/(app)/broker/discover/actions";
import type { LinkState } from "@/lib/directory";

function RequestForm({ hostId, onDone }: { hostId: string; onDone: () => void }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(undefined);
        const r = await requestCollabAction(hostId, note);
        setBusy(false);
        if (r.error) return setError(r.error);
        router.refresh(); onDone();
      }}
    >
      <label className="block text-sm font-medium" htmlFor="collab-note">Lời nhắn giới thiệu (tuỳ chọn)</label>
      <textarea id="collab-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={4} placeholder="VD: Em chuyên chạy ads villa Đà Lạt, có tệp khách gia đình cuối tuần ạ" className="brutal-input w-full p-2 text-base" />
      {error && <p role="alert" className="text-sm font-medium text-red-700">{error}</p>}
      <Button type="submit" size="lg" className="h-12 w-full" disabled={busy}>{busy ? "Đang gửi…" : "Gửi yêu cầu cộng tác"}</Button>
    </form>
  );
}

/** Nút theo trạng thái liên kết: Xin cộng tác / Đang chờ duyệt (huỷ được) / Đã duyệt / Bị từ chối (xin lại) / Bị chặn. */
export function CollabButton({ hostId, link }: { hostId: string; link: LinkState }) {
  if (link === "APPROVED") return <span className="inline-flex h-11 items-center rounded border border-black bg-secondary px-3 text-sm font-semibold">✅ Đã cộng tác</span>;
  if (link === "BLOCKED") return <span className="inline-flex h-11 items-center px-3 text-sm text-muted-foreground">Không thể gửi yêu cầu</span>;
  if (link === "PENDING") {
    return (
      <span className="inline-flex flex-wrap items-center gap-2">
        <span className="inline-flex h-11 items-center rounded border border-black bg-muted px-3 text-sm font-semibold">⏳ Đang chờ duyệt</span>
        <ActionButton action={() => cancelCollabAction(hostId)} confirm="Huỷ yêu cầu cộng tác?" className="h-11">Huỷ yêu cầu</ActionButton>
      </span>
    );
  }
  return (
    <Modal trigger={link === "REJECTED" ? "Xin cộng tác lại" : "Xin cộng tác"} title="Xin cộng tác với chủ nhà">
      {(close) => <RequestForm hostId={hostId} onDone={close} />}
    </Modal>
  );
}
