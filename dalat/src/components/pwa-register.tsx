"use client";

import { useEffect } from "react";

/** Đăng ký service worker (chỉ production — ở dev, SW làm khó việc debug). */
export function PwaRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || !("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch((e) => console.error("[pwa] đăng ký SW lỗi:", e));
  }, []);
  return null;
}
