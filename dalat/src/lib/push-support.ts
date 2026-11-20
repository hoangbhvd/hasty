/** Phân loại khả năng nhận Web Push của thiết bị (iPhone chỉ nhận khi app đã "Thêm vào Màn hình chính", iOS ≥ 16.4). */
export type PushSupport = "unconfigured" | "ios-install" | "ios-old" | "unsupported" | "ok";

export function isIos(ua: string, maxTouchPoints = 0): boolean {
  // iPadOS 13+ tự nhận là Macintosh nhưng có cảm ứng
  return /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);
}

export function iosVersion(ua: string): number | null {
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

export function pushSupport(i: { vapidKey: string; ua: string; maxTouchPoints?: number; standalone: boolean; hasServiceWorker: boolean; hasPushManager: boolean }): PushSupport {
  if (!i.vapidKey) return "unconfigured";
  if (isIos(i.ua, i.maxTouchPoints)) {
    if (!i.standalone) {
      const v = iosVersion(i.ua);
      return v !== null && v < 16.04 ? "ios-old" : "ios-install";
    }
    return i.hasServiceWorker && i.hasPushManager ? "ok" : "ios-old";
  }
  return i.hasServiceWorker && i.hasPushManager ? "ok" : "unsupported";
}
