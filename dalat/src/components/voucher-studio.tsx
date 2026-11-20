"use client";

import { useState } from "react";
import { VoucherConfigForm } from "@/components/voucher-config-form";
import { PdfmeStudio } from "@/components/pdfme-studio";
import { ActionButton } from "@/components/action-button";
import { setVoucherModeAction } from "@/app/(app)/voucher-actions";
import type { VoucherConfig } from "@/lib/voucher-config";

type Props = React.ComponentProps<typeof VoucherConfigForm>;

/** Voucher Studio: 2 chế độ — "Mẫu có sẵn" (HTML/CSS) và "Canva + kéo thả" (PDF nền + pdfme). */
export function VoucherStudio(props: Props) {
  const c: VoucherConfig = props.config;
  const [tab, setTab] = useState<"TEMPLATE" | "CUSTOM_PDFME">(c.mode);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2" role="tablist" aria-label="Chế độ thiết kế">
        {([["TEMPLATE", "Mẫu có sẵn"], ["CUSTOM_PDFME", "Canva + kéo thả"]] as const).map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`brutal-btn h-11 text-sm text-black ${tab === k ? "bg-primary" : "bg-white"}`}>{label}</button>
        ))}
      </div>
      {tab === "TEMPLATE" ? (
        <>
          {c.mode === "CUSTOM_PDFME" && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded border border-black bg-status-holding p-3 text-sm">
              <span>Phiếu gửi khách hiện đang dùng <b>PDF Canva</b>, không dùng mẫu này.</span>
              <ActionButton action={() => setVoucherModeAction(props.propertyId, "TEMPLATE")} className="h-10">Dùng mẫu có sẵn</ActionButton>
            </div>
          )}
          <VoucherConfigForm {...props} />
        </>
      ) : (
        <PdfmeStudio
          propertyId={props.propertyId} hasBase={!!c.pdfme_config.base_pdf_url} schemas={c.pdfme_config.schemas} mode={c.mode}
          r2Ready={props.r2Ready ?? false} previews={props.previews}
        />
      )}
    </div>
  );
}
