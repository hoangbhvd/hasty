"use client";

import { useState } from "react";
import { ActionButton } from "@/components/action-button";
import { TIER_LABEL, enumOptions } from "@/lib/labels";
import { approveRequestAction, rejectRequestAction } from "@/app/(app)/host/partners/actions";

/** Chọn hạng giá rồi Chấp nhận, hoặc Từ chối. */
export function PendingActions({ linkId, name }: { linkId: string; name: string }) {
  const [tier, setTier] = useState("STANDARD");
  return (
    <div className="flex flex-wrap items-center gap-2">
      <select aria-label="Hạng giá" value={tier} onChange={(e) => setTier(e.target.value)} className="brutal-input h-11 px-2 text-base">
        {enumOptions(TIER_LABEL).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
      <ActionButton action={() => approveRequestAction(linkId, tier)} className="h-11 bg-primary">Chấp nhận</ActionButton>
      <ActionButton action={() => rejectRequestAction(linkId)} confirm={`Từ chối ${name}?`} className="h-11">Từ chối</ActionButton>
    </div>
  );
}
