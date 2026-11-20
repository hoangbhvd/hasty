"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { Badge, LINK_TONE } from "@/components/ui/badge";
import { LINK_STATUS_LABEL, TIER_LABEL, enumOptions } from "@/lib/labels";
import { setLinkStatusAction, setLinkTierAction } from "@/app/(app)/host/partners/actions";
import { openChatAction } from "@/app/(app)/chat-actions";
import { PartnerAccess } from "@/components/partner-access";

export function PartnerRow({
  link, properties,
}: {
  link: { id: string; brokerId: string; name: string; phone: string | null; tier: keyof typeof TIER_LABEL; status: keyof typeof LINK_STATUS_LABEL; accessRole: "BROKER" | "CO_HOST" | "CARETAKER"; allowInstantBook: boolean; coHostSeesNet: boolean; assignedPropertyIds: string[] | null };
  properties: { id: string; name: string }[];
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <li className="space-y-2 p-3">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="font-medium">{link.name}</div>
          <div className="text-sm text-muted-foreground">{link.phone ?? "—"}</div>
        </div>
        <Badge tone={LINK_TONE[link.status]}>{LINK_STATUS_LABEL[link.status]}</Badge>
      </div>
      {link.status === "APPROVED" && <PartnerAccess linkId={link.id} name={link.name} role={link.accessRole} instant={link.allowInstantBook} seesNet={link.coHostSeesNet} assigned={link.assignedPropertyIds} properties={properties} />}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Hạng đối tác"
          defaultValue={link.tier}
          disabled={pending}
          onChange={(e) => start(async () => { await setLinkTierAction(link.id, e.target.value); router.refresh(); })}
          className="brutal-input h-9 px-2 text-sm"
        >
          {enumOptions(TIER_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {link.status === "APPROVED" && (
          <form action={openChatAction.bind(null, link.brokerId, "HOST")}>
            <button type="submit" className="brutal-btn inline-flex h-9 items-center bg-white px-3 text-sm text-black">💬 Nhắn tin</button>
          </form>
        )}
        {link.status !== "APPROVED" && (
          <ActionButton action={() => setLinkStatusAction(link.id, "APPROVED")}>Duyệt</ActionButton>
        )}
        {link.status !== "BLOCKED" && (
          <ActionButton action={() => setLinkStatusAction(link.id, "BLOCKED")} confirm={`Chặn ${link.name}?`} className="bg-destructive">Chặn</ActionButton>
        )}
      </div>
    </li>
  );
}
