// Custom server: Next.js + Socket.io (chat real-time, cập nhật trạng thái booking).
// Chạy: `npm run dev` (dev) hoặc `npm start` (production, sau `npm run build`).
import "dotenv/config";
import { createServer } from "node:http";
import next from "next";
import { Server } from "socket.io";
import IORedis from "ioredis";
import { auth } from "./src/lib/auth";
import { RT_CHANNEL, setIo, userRoom, type RtMessage } from "./src/lib/realtime";

const port = parseInt(process.env.PORT || "3000", 10);
const dev = process.env.NODE_ENV !== "production";

async function main() {
  const app = next({ dev, hostname: "localhost", port });
  const handle = app.getRequestHandler();
  await app.prepare();

  const httpServer = createServer((req, res) => { handle(req, res); });
  const io = new Server(httpServer, { serveClient: false });

  // Xác thực socket bằng đúng cookie phiên của Better Auth — không tin userId do client gửi
  io.use(async (socket, nextFn) => {
    try {
      const headers = new Headers();
      if (socket.handshake.headers.cookie) headers.set("cookie", socket.handshake.headers.cookie);
      const session = await auth.api.getSession({ headers });
      if (!session) return nextFn(new Error("unauthorized"));
      socket.data.userId = session.user.id;
      nextFn();
    } catch {
      nextFn(new Error("unauthorized"));
    }
  });
  io.on("connection", (socket) => {
    socket.join(userRoom(socket.data.userId as string)); // mỗi người chỉ vào phòng của chính mình
  });
  setIo(io);

  // Nhận sự kiện từ worker (tiến trình khác) qua Redis và chuyển tiếp tới socket
  const u = new URL(process.env.REDIS_URL ?? "redis://localhost:6380");
  const sub = new IORedis({ host: u.hostname, port: Number(u.port || 6379), password: u.password ? decodeURIComponent(u.password) : undefined, maxRetriesPerRequest: null });
  sub.on("error", () => {});
  sub.subscribe(RT_CHANNEL).catch(() => {});
  sub.on("message", (_ch, raw) => {
    try {
      const m = JSON.parse(raw) as RtMessage;
      io.to(m.rooms).emit(m.event, m.payload);
    } catch { /* bỏ qua gói lỗi */ }
  });

  httpServer.listen(port, () => {
    console.log(`> Sẵn sàng tại http://localhost:${port} (${dev ? "development" : "production"}, TZ=${process.env.TZ ?? "?"})`);
  });
}

main().catch((e) => { console.error(e); process.exit(1); });
