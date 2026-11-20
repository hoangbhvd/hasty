// Test tích hợp bộ ảnh (album): gallery công khai và gửi bộ ảnh trong chat. Chạy: npm run test:int
import "dotenv/config";
import { test, after, before } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "./db";
import { galleryTabs, loadGallery, loadPublicGallery } from "./albums";
import { ChatError, openDirectConversation, shareMediaPack } from "./chat";

const tag = `al${Date.now()}`;
let host: string, broker: string, propId: string, roomId: string, albumA: string, albumB: string, token: string, shareA: string, convId: string;

before(async () => {
  const u = (x: string) => prisma.user.create({ data: { email: `${tag}-${x}@t.local`, fullName: x, phone: x === "host" ? "0911000111" : undefined } });
  host = (await u("host")).id; broker = (await u("broker")).id;
  await prisma.hostBrokerLink.create({ data: { hostId: host, brokerId: broker, status: "APPROVED" } });
  const p = await prisma.property.create({ data: { sourceType: "HOST_MANAGED", hostId: host, name: `${tag}-villa`, address: "Hẻm bí mật 99", caretakerPhone: "0900123456", baseWeekdayNet: 1_777_000, googleMapsUrl: "https://maps.example/secret" } });
  propId = p.id; token = p.galleryToken;
  roomId = (await prisma.room.create({ data: { propertyId: propId, name: "Áp mái", maxGuests: 2 } })).id;
  const a = await prisma.propertyAlbum.create({ data: { propertyId: propId, name: "Sân BBQ", sortOrder: 0 } });
  const b = await prisma.propertyAlbum.create({ data: { propertyId: propId, name: "Phòng Áp Mái", roomId, sortOrder: 1 } });
  albumA = a.id; albumB = b.id; shareA = a.shareToken;
  const m = (name: string, albumId: string | null, order: number, thumb?: string) => prisma.propertyMedia.create({ data: { propertyId: propId, albumId, roomId: albumId === albumB ? roomId : null, url: `https://r2.example/${name}.jpg`, thumbUrl: thumb ?? null, mediaType: "IMAGE", sortOrder: order } });
  await m("g1", null, 0); await m("a1", albumA, 0, "https://r2.example/a1-t.webp"); await m("a2", albumA, 1); await m("b1", albumB, 0);
  convId = (await openDirectConversation(host, broker, "HOST")).id;
});
after(async () => {
  await prisma.message.deleteMany({ where: { conversationId: convId } });
  await prisma.conversation.deleteMany({ where: { hostId: host } });
  await prisma.propertyMedia.deleteMany({ where: { propertyId: propId } });
  await prisma.propertyAlbum.deleteMany({ where: { propertyId: propId } });
  await prisma.room.deleteMany({ where: { propertyId: propId } });
  await prisma.property.deleteMany({ where: { id: propId } });
  await prisma.hostBrokerLink.deleteMany({ where: { hostId: host } });
  await prisma.user.deleteMany({ where: { email: { startsWith: tag } } });
  await prisma.$disconnect();
});

test("Kho ảnh chia theo album; ảnh chưa phân loại nằm ở Ảnh chung; thumb dự phòng bằng ảnh gốc", async () => {
  const g = (await loadGallery(propId))!;
  assert.deepEqual(g.general.map((m) => m.url.split("/").pop()), ["g1.jpg"]);
  assert.deepEqual(g.albums.map((a) => [a.name, a.media.length]), [["Sân BBQ", 2], ["Phòng Áp Mái", 1]]);
  assert.equal(g.albums[0].media[0].thumb, "https://r2.example/a1-t.webp");
  assert.equal(g.albums[0].media[1].thumb, "https://r2.example/a2.jpg");
  assert.deepEqual(galleryTabs(g).map((t) => t.name), ["Ảnh chung", "Sân BBQ", "Phòng Áp Mái · Áp mái"]);
  assert.equal((await loadGallery(propId, { albumId: albumB }))!.albums.length, 1);
});

test("Link công khai: token căn = cả căn, token album = riêng bộ đó; không lộ giá/SĐT/địa chỉ/tên chủ", async () => {
  const all = (await loadPublicGallery(token))!;
  assert.equal(all.scope, "PROPERTY"); assert.equal(all.albums.length, 2);
  const one = (await loadPublicGallery(shareA))!;
  assert.equal(one.scope, "ALBUM"); assert.deepEqual(one.albums.map((a) => a.name), ["Sân BBQ"]); assert.equal(one.general.length, 0);
  const json = JSON.stringify([all, one]);
  for (const secret of ["1777000", "0900123456", "0911000111", "Hẻm bí mật", "maps.example/secret", "host", "caretaker", "Net"]) assert.ok(!json.includes(secret), secret);
  assert.equal(await loadPublicGallery("00000000-0000-4000-8000-000000000000"), null);
  assert.equal(await loadPublicGallery("khong-phai-uuid"), null);
  assert.equal(await loadPublicGallery(propId), null); // id căn không phải token
});

test("Chat: gửi 1 hoặc nhiều bộ ảnh; không chọn = tất cả; bộ lạ / bộ rỗng bị từ chối", async () => {
  const one = await shareMediaPack(host, convId, propId, [albumA]);
  const m1 = one.metadata as { total: number; albums: { key: string; name: string; count: number }[]; items: unknown[] };
  assert.equal(m1.total, 2); assert.deepEqual(m1.albums.map((a) => a.name), ["Sân BBQ"]);
  const two = await shareMediaPack(host, convId, propId, ["general", albumB]);
  assert.deepEqual((two.metadata as { albums: { name: string }[] }).albums.map((a) => a.name), ["Ảnh chung", "Phòng Áp Mái"]);
  const all = await shareMediaPack(host, convId, propId);
  assert.equal((all.metadata as { total: number }).total, 4);
  await assert.rejects(shareMediaPack(host, convId, propId, ["00000000-0000-4000-8000-000000000000"]), ChatError);
  const empty = await prisma.propertyAlbum.create({ data: { propertyId: propId, name: "Trống" } });
  await assert.rejects(shareMediaPack(host, convId, propId, [empty.id]), ChatError);
  await assert.rejects(shareMediaPack(broker, convId, propId), ChatError); // CTV không gửi được
});
