// Chạy THẬT file public/sw.js trong môi trường giả lập (trình duyệt nhúng không cho đăng ký SW nên không kiểm thử được bằng tay).
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import vm from "node:vm";

type Req = { method: string; url: string; mode?: string };
type Res = { tag: string };
type Ev = Record<string, unknown>;
type Notif = { title: string; options: { body: string; data: { url: string } } };
const ORIGIN = "http://app.test";
const code = readFileSync(join(process.cwd(), "public/sw.js"), "utf8");

function boot(opts: { network?: (r: Req) => Promise<{ ok: boolean; clone(): unknown; tag: string }> } = {}) {
  const handlers: Record<string, (e: Ev) => void> = {};
  const store = new Map<string, Map<string, unknown>>();
  const shown: Notif[] = [];
  const opened: string[] = [];
  const focused: string[] = [];
  let wins: { url: string; focus(): Promise<{ navigate(u: string): Promise<void> }> }[] = [];
  let networkCalls = 0;
  let skipped = false;

  const cacheApi = (name: string) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = store.get(name)!;
    return {
      addAll: async (urls: string[]) => { for (const u of urls) m.set(new URL(u, ORIGIN).pathname, { tag: `pre:${u}` }); },
      put: async (req: Req, res: unknown) => { m.set(new URL(req.url).pathname, res); },
      keys: async () => [...m.keys()],
    };
  };
  const caches = {
    open: async (n: string) => cacheApi(n),
    keys: async () => [...store.keys()],
    delete: async (n: string) => store.delete(n),
    match: async (r: Req | string) => {
      const path = typeof r === "string" ? r : new URL(r.url).pathname;
      for (const m of store.values()) if (m.has(path)) return m.get(path);
      return undefined;
    },
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (t: string, f: (e: unknown) => void) => { handlers[t] = f; },
    skipWaiting: async () => { skipped = true; },
    clients: {
      claim: async () => {},
      matchAll: async () => wins,
      openWindow: async (u: string) => { opened.push(u); },
    },
    registration: { showNotification: async (title: string, options: unknown) => { shown.push({ title, options } as Notif); } },
  };
  const fetchImpl = async (r: Req) => {
    networkCalls++;
    if (opts.network) return opts.network(r);
    return { ok: true, tag: `net:${r.url}`, clone() { return this; } };
  };
  vm.runInNewContext(code, { self, caches, fetch: fetchImpl, URL, Promise, console });

  const run = async (type: string, extra: Record<string, unknown> = {}) => {
    let waited: Promise<unknown> = Promise.resolve();
    handlers[type]({ waitUntil: (p: Promise<unknown>) => { waited = p; }, ...extra });
    await waited;
  };
  const doFetch = async (req: Req): Promise<Res | undefined> => {
    let responded: Promise<unknown> | undefined;
    handlers.fetch({ request: req, respondWith: (p: Promise<unknown>) => { responded = p; } });
    return responded ? ((await responded) as Res) : undefined; // undefined = SW không can thiệp (trình duyệt tự đi mạng)
  };
  return { run, doFetch, store, shown, opened, focused, setWins: (w: typeof wins) => { wins = w; }, calls: () => networkCalls, skipped: () => skipped };
}
const GET = (path: string, mode = "cors"): Req => ({ method: "GET", url: ORIGIN + path, mode });

test("install: precache trang offline/manifest/icon và kích hoạt ngay", async () => {
  const sw = boot();
  await sw.run("install");
  const cached = [...sw.store.get("static-v1")!.keys()];
  assert.ok(cached.includes("/offline.html") && cached.includes("/manifest.json") && cached.includes("/icons/icon-192.png"));
  assert.equal(sw.skipped(), true);
});

test("activate: xoá cache phiên bản cũ, giữ cache hiện tại", async () => {
  const sw = boot();
  sw.store.set("static-v0", new Map()); sw.store.set("static-v1", new Map()); sw.store.set("khác", new Map());
  await sw.run("activate");
  assert.deepEqual([...sw.store.keys()], ["static-v1"]);
});

test("KHÔNG can thiệp: POST, khác origin, /api/*, /socket.io/*, request không phải điều hướng tới trang", async () => {
  const sw = boot();
  assert.equal(await sw.doFetch({ method: "POST", url: ORIGIN + "/api/x" }), undefined);
  assert.equal(await sw.doFetch({ method: "GET", url: "https://other.example/a.js" }), undefined);
  assert.equal(await sw.doFetch(GET("/api/chat/unread")), undefined);
  assert.equal(await sw.doFetch(GET("/api/auth/get-session")), undefined);
  assert.equal(await sw.doFetch(GET("/socket.io/?EIO=4")), undefined);
  assert.equal(await sw.doFetch(GET("/host/calendar?_rsc=abc")), undefined); // dữ liệu RSC/server action
  assert.equal(sw.calls(), 0);
});

test("điều hướng trang: đi mạng, KHÔNG lưu HTML vào cache (dữ liệu riêng tư)", async () => {
  const sw = boot();
  await sw.run("install");
  const before = JSON.stringify([...sw.store.get("static-v1")!.keys()]);
  const res = (await sw.doFetch(GET("/host/finance", "navigate")))!;
  assert.equal(res.tag, "net:" + ORIGIN + "/host/finance");
  assert.equal(JSON.stringify([...sw.store.get("static-v1")!.keys()]), before); // không thêm gì
  assert.equal(await sw.doFetch(GET("/voucher/abc", "navigate")).then((r) => r!.tag.startsWith("net:")), true);
});

test("mất mạng khi điều hướng → hiện trang offline", async () => {
  const sw = boot({ network: async () => { throw new TypeError("Failed to fetch"); } });
  await sw.run("install");
  const res = (await sw.doFetch(GET("/host/calendar", "navigate")))!;
  assert.equal(res.tag, "pre:/offline.html");
});

test("tài nguyên tĩnh /_next/static: lần đầu đi mạng rồi cache; lần sau lấy từ cache (không gọi mạng)", async () => {
  const sw = boot();
  const first = (await sw.doFetch(GET("/_next/static/chunks/app.abc123.js", "no-cors")))!;
  assert.equal(sw.calls(), 1);
  assert.equal(first.tag, "net:" + ORIGIN + "/_next/static/chunks/app.abc123.js");
  const second = (await sw.doFetch(GET("/_next/static/chunks/app.abc123.js", "no-cors")))!;
  assert.equal(sw.calls(), 1); // không thêm lần gọi mạng
  assert.equal(second.tag, first.tag);
});

test("tài nguyên tĩnh lỗi (ok=false) không bị cache", async () => {
  const sw = boot({ network: async () => ({ ok: false, tag: "500", clone() { return this; } }) });
  await sw.doFetch(GET("/_next/static/chunks/broken.js", "no-cors"));
  assert.equal(await sw.doFetch(GET("/_next/static/chunks/broken.js", "no-cors")).then((r) => r!.tag), "500");
  assert.equal(sw.calls(), 2); // lần 2 vẫn phải gọi mạng
});

test("push: hiện thông báo đúng nội dung; payload lỗi/thiếu vẫn không làm SW chết", async () => {
  const sw = boot();
  await sw.run("push", { data: { json: () => ({ title: "Booking mới", body: "Khách An 2 đêm", url: "/host/bookings/1" }) } });
  assert.equal(sw.shown[0].title, "Booking mới");
  assert.equal(sw.shown[0].options.body, "Khách An 2 đêm");
  assert.equal(sw.shown[0].options.data.url, "/host/bookings/1");

  await sw.run("push", { data: { json: () => { throw new Error("bad json"); }, text: () => "văn bản thô" } });
  assert.equal(sw.shown[1].title, "Đà Lạt Homestay");
  assert.equal(sw.shown[1].options.body, "văn bản thô");

  await sw.run("push", { data: null });
  assert.equal(sw.shown.length, 3);
});

const click = (sw: ReturnType<typeof boot>, url?: string) => {
  const e: { notification: { close(): void; data?: { url: string } }; closed: boolean } = {
    notification: { close() { e.closed = true; }, data: url === undefined ? undefined : { url } },
    closed: false,
  };
  return sw.run("notificationclick", e).then(() => e);
};

test("bấm thông báo: đóng thông báo; có cửa sổ sẵn thì focus + điều hướng, chưa có thì mở mới", async () => {
  const sw = boot();
  const nav: string[] = [];
  sw.setWins([{ url: ORIGIN + "/host", focus: async () => ({ navigate: async (u: string) => { nav.push(u); } }) }]);
  const e = await click(sw, "/host/chat/42");
  assert.equal(e.closed, true);
  assert.deepEqual(nav, [ORIGIN + "/host/chat/42"]);
  assert.equal(sw.opened.length, 0);

  const sw2 = boot();
  await click(sw2, "/broker/bookings/9");
  assert.deepEqual(sw2.opened, [ORIGIN + "/broker/bookings/9"]);
});

test("bấm thông báo: URL khác origin bị chặn → về trang chủ; thiếu URL → trang chủ", async () => {
  const sw = boot();
  await click(sw, "https://evil.example/phish");
  await click(sw, "//evil.example/x");
  await click(sw, undefined);
  assert.deepEqual(sw.opened, [ORIGIN + "/", ORIGIN + "/", ORIGIN + "/"]);
});
