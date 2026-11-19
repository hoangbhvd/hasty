"use client";

import { io, type Socket } from "socket.io-client";

let socket: Socket | undefined;

/** 1 kết nối socket duy nhất cho cả app (cookie phiên được trình duyệt tự gửi kèm). */
export function getSocket(): Socket {
  if (!socket) socket = io({ transports: ["websocket", "polling"], withCredentials: true });
  return socket;
}

export function closeSocket() {
  socket?.disconnect();
  socket = undefined;
}
