import { test, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { RenderError, renderUrl, renderVoucher } from "./voucher-render";

let last: { url?: string; body: string } = { body: "" };
let status = 200;
const srv = createServer((req, res) => {
  const chunks: Buffer[] = [];
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => { last = { url: req.url, body: Buffer.concat(chunks).toString("latin1") }; res.statusCode = status; res.end("FILE"); });
});
const ready = new Promise<void>((r) => srv.listen(0, r));
after(() => srv.close());

const T = "a944f676-4fb1-4556-8316-5c9909cab1ca";

test("PDF: gọi convert/url với khổ A4, không lề, in nền", async () => {
  await ready;
  process.env.GOTENBERG_URL = `http://127.0.0.1:${(srv.address() as AddressInfo).port}`;
  process.env.VOUCHER_RENDER_BASE_URL = "http://web:3000";
  const out = await renderVoucher(T, "pdf");
  assert.equal(out.toString(), "FILE");
  assert.equal(last.url, "/forms/chromium/convert/url");
  assert.match(last.body, new RegExp(`http://web:3000/voucher/${T}/render`));
  for (const f of ['name="paperWidth"', 'name="printBackground"', 'name="marginTop"']) assert.ok(last.body.includes(f), f);
});

test("PNG A4 / thẻ: đúng endpoint, kích thước và chế độ chụp", async () => {
  await renderVoucher(T, "png", "a4");
  assert.equal(last.url, "/forms/chromium/screenshot/url");
  assert.match(last.body, /name="width"\r\n\r\n1588/); assert.match(last.body, /name="clip"\r\n\r\ntrue/);
  await renderVoucher(T, "png", "card");
  assert.match(last.body, /name="width"\r\n\r\n900/); assert.match(last.body, /name="clip"\r\n\r\nfalse/);
  assert.match(last.body, /layout=card/);
  assert.equal(renderUrl(T, "pdf", "a4"), `http://web:3000/voucher/${T}/render`);
});

test("lỗi: Gotenberg trả 500 hoặc chưa cấu hình", async () => {
  status = 500;
  await assert.rejects(renderVoucher(T, "pdf"), (e) => e instanceof RenderError && e.status === 502);
  delete process.env.GOTENBERG_URL;
  await assert.rejects(renderVoucher(T, "pdf"), (e) => e instanceof RenderError && e.status === 503);
});
