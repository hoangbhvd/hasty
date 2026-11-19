"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton } from "@/components/action-button";
import { LINK_STATUS_LABEL, TIER_LABEL, enumOptions } from "@/lib/labels";
import { setLinkStatusAction, setLinkTierAction } from "@/app/(app)/host/partners/actions";

export function PartnerRow({
  link,
}: {
  link: { id: string; name: string; phone: string | null; tier: keyof typeof TIER_LABEL; status: keyof typeof LINK_STATUS_LABEL };
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
        <span className="rounded-full border px-2 py-0.5 text-xs">{LINK_STATUS_LABEL[link.status]}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Hạng đối tác"
          defaultValue={link.tier}
          disabled={pending}
          onChange={(e) => start(async () => { await setLinkTierAction(link.id, e.target.value); router.refresh(); })}
          className="h-9 rounded-md border bg-background px-2 text-sm"
        >
          {enumOptions(TIER_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        {link.status !== "APPROVED" && (
          <ActionButton action={() => setLinkStatusAction(link.id, "APPROVED")}>Duyệt</ActionButton>
        )}
        {link.status !== "BLOCKED" && (
          <ActionButton action={() => setLinkStatusAction(link.id, "BLOCKED")} confirm={`Chặn ${link.name}?`} className="text-destructive">Chặn</ActionButton>
        )}
      </div>
    </li>
  );
}
