"use client";
import { useState } from "react";

/** Sao chép văn bản (để dán vào Zalo/Messenger gửi khách). */
export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button type="button" className="btn-ghost" onClick={async () => {
      try { await navigator.clipboard.writeText(text); setDone(true); setTimeout(() => setDone(false), 2000); } catch { window.prompt("Sao chép nội dung:", text); }
    }}>{done ? "Đã sao chép ✓" : label}</button>
  );
}
