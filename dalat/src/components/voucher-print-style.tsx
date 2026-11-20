/** CSS xuất A4 của phiếu. `forced`=true: áp dụng luôn (trang /render cho Gotenberg dựng PDF/PNG); false: chỉ khi in (@media print). */
export function VoucherPrintStyle({ boutique, forced = false, scale = 1 }: { boutique: boolean; forced?: boolean; scale?: number }) {
  const wrap = (rules: string) => (forced ? rules : `@media print { ${rules} }`);
  const boutiqueRules = `
    html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    main { padding: 0 !important; }
    #voucher-capture { max-width: none !important; width: 210mm !important; min-height: 296mm !important; margin: 0 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }`;
  const otherRules = `
    html, body { background: #fff !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    .no-print { display: none !important; }
    main { padding: ${forced ? "8mm" : "0"} !important; }
    #voucher-capture { max-width: none !important; width: 100% !important; box-shadow: none !important; border: 0 !important; padding: 0 !important; display: block !important; font-size: 8.6pt; column-count: 2; column-gap: 8mm; }
    #voucher-capture > * { break-inside: avoid; margin-bottom: 2mm !important; }
    #voucher-capture header, #voucher-capture img.aspect-\\[4\\/5\\] { column-span: all; }
    #voucher-capture img.aspect-\\[4\\/5\\] { aspect-ratio: 6 / 1 !important; }
    #voucher-capture img[alt*="VietQR"] { width: 28mm !important; }
    #voucher-capture section { padding-top: 2mm !important; }
    #voucher-capture section > * { margin-block: 0.8mm !important; }
    #voucher-capture footer { padding-top: 2mm !important; }`;
  const page = boutique || forced ? "@page { size: A4; margin: 0; }" : "@page { size: A4; margin: 8mm; }";
  const zoom = forced && scale !== 1 ? `html { zoom: ${scale}; }` : "";
  return <style>{`${page} ${wrap(boutique ? boutiqueRules : otherRules)} ${zoom}`}</style>;
}
