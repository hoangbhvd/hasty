import { test } from "node:test";
import assert from "node:assert/strict";
import { pushSupport } from "./push-support";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
const IPHONE_OLD = "Mozilla/5.0 (iPhone; CPU iPhone OS 15_6 like Mac OS X) AppleWebKit/605.1.15 Version/15.6 Mobile/15E148 Safari/604.1";
const IPAD_DESKTOP_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36";
const base = { vapidKey: "k", standalone: false, hasServiceWorker: true, hasPushManager: true };

test("thiếu khoá VAPID → chưa cấu hình (mọi thiết bị)", () => {
  assert.equal(pushSupport({ ...base, vapidKey: "", ua: CHROME }), "unconfigured");
});
test("iPhone mở trong Safari (chưa cài) → hướng dẫn Thêm vào Màn hình chính", () => {
  assert.equal(pushSupport({ ...base, ua: IPHONE, hasPushManager: false }), "ios-install");
});
test("iPhone iOS cũ hơn 16.4 → cần cập nhật", () => {
  assert.equal(pushSupport({ ...base, ua: IPHONE_OLD, hasPushManager: false }), "ios-old");
});
test("iPhone đã cài ra Màn hình chính (standalone) → dùng được", () => {
  assert.equal(pushSupport({ ...base, ua: IPHONE, standalone: true }), "ok");
});
test("iPad (UA giả Mac nhưng có cảm ứng) cũng được coi là iOS", () => {
  assert.equal(pushSupport({ ...base, ua: IPAD_DESKTOP_UA, maxTouchPoints: 5, hasPushManager: false }), "ios-install");
  assert.equal(pushSupport({ ...base, ua: IPAD_DESKTOP_UA, maxTouchPoints: 0 }), "ok"); // Mac thật
});
test("trình duyệt thường: có PushManager thì ok, không thì unsupported", () => {
  assert.equal(pushSupport({ ...base, ua: CHROME }), "ok");
  assert.equal(pushSupport({ ...base, ua: CHROME, hasPushManager: false }), "unsupported");
});
