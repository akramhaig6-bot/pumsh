import { emitLive } from "./notify.js";

/** ربط Socket.IO بخدمة الإشعارات */
export function attachRealtime(io) {
  emitLive(io);
  console.log("[realtime] socket.io متصل");
}
