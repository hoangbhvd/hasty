/* Service worker — Đà Lạt Homestay.
 * Nguyên tắc: KHÔNG cache trang HTML hay API (dữ liệu đăng nhập, booking, tiền bạc phải luôn mới và riêng tư).
 * Chỉ cache tài nguyên tĩnh để mở nhanh + trang offline + xử lý Web Push. */
const VERSION = "v1";
const CACHE = `static-${VERSION}`;
const PRECACHE = ["/offline.html", "/manifest.json", "/icons/icon-192.png", "/icons/icon-512.png"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/socket.io/")) return; // luôn đi mạng

  // Điều hướng trang: mạng trước, mất mạng thì hiện trang offline
  if (req.mode === "navigate") {
    e.respondWith(fetch(req).catch(() => caches.match("/offline.html")));
    return;
  }
  // Tài nguyên tĩnh bất biến (file băm tên của Next) và icon: cache trước
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/icons/")) {
    e.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(CACHE).then((c) => c.put(req, copy)); }
        return res;
      })),
    );
  }
});

self.addEventListener("push", (e) => {
  let data = {};
  try { data = e.data ? e.data.json() : {}; } catch { data = { body: e.data && e.data.text() }; }
  e.waitUntil(
    self.registration.showNotification(data.title || "Đà Lạt Homestay", {
      body: data.body || "",
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      data: { url: data.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  // Chỉ mở URL cùng origin (payload push không được phép đưa người dùng ra trang ngoài)
  let u = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin);
  if (u.origin !== self.location.origin) u = new URL("/", self.location.origin);
  const target = u.href;
  e.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      const w = wins.find((c) => c.url.startsWith(self.location.origin));
      if (w) return w.focus().then((c) => c.navigate(target));
      return self.clients.openWindow(target);
    }),
  );
});
