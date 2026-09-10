import { config } from "../config.js";
import logger from "../lib/logger.js";

/**
 * ============================================================
 * [RT-1 … RT-5] مركز البث اللحظي عبر Socket.IO
 * ============================================================
 *
 * الغرف:
 *   "public"        → كل متصل (زائر أو مسجّل): العروض، المقالات، البانرات، الإعدادات، النصوص
 *   "u:{userId}"    → مستخدم بعينه: طلباته، تذاكره، إشعاراته
 *   "admin"         → كل الأدمن: الإحصاءات، الإشعارات الإدارية
 *
 * قاعدة الإرسال:
 *   محتوى عام (offer/article/banner/page/category/menu/settings/texts) → public
 *   بيانات خاصة (request/ticket/notification)                        → u:{userId}
 *   إحصاءات ولوحة                                                     → admin
 *
 * كل حدث يحمل دائماً { at } (توقيت الخادم) حتى تستطيع الواجهة تجاهل
 * الأحداث الأقدم من حالتها الحالية.
 */

let io = null;

/* ============================================================
   [RT-1] خريطة الأحداث الكاملة
============================================================ */
export const EV = {
  /* العروض */
  OFFER_CREATED: "offer:created",
  OFFER_UPDATED: "offer:updated",
  OFFER_DELETED: "offer:deleted",
  OFFER_PUBLISHED: "offer:published",
  OFFER_UNPUBLISHED: "offer:unpublished",

  /* المقالات */
  ARTICLE_CREATED: "article:created",
  ARTICLE_UPDATED: "article:updated",
  ARTICLE_DELETED: "article:deleted",
  ARTICLE_PUBLISHED: "article:published",

  /* الصفحات والتصنيفات والقوائم */
  PAGE_UPDATED: "page:updated",
  PAGE_DELETED: "page:deleted",
  CATEGORY_UPDATED: "category:updated",
  CATEGORY_DELETED: "category:deleted",
  MENU_UPDATED: "menu:updated",

  /* البانرات */
  BANNER_CREATED: "banner:created",
  BANNER_UPDATED: "banner:updated",
  BANNER_DELETED: "banner:deleted",

  /* الطلبات */
  REQUEST_STATUS_CHANGED: "request:status_changed",
  REQUEST_NOTE_ADDED: "request:note_added",
  REQUEST_INFO_REQUESTED: "request:info_requested",
  REQUEST_ASSIGNED: "request:assigned",
  REQUEST_CREATED: "request:created",
  REQUEST_CANCELLED: "request:cancelled",

  /* التذاكر */
  TICKET_STATUS_CHANGED: "ticket:status_changed",
  TICKET_REPLY_ADDED: "ticket:reply_added",
  TICKET_ASSIGNED: "ticket:assigned",
  TICKET_CREATED: "ticket:created",

  /* الإعدادات والنصوص */
  SETTINGS_UPDATED: "settings:updated",
  TEXTS_UPDATED: "texts:updated",

  /* الإشعارات */
  NOTIFICATION_NEW: "notification:new",

  /* [RT-5] لوحة الإدارة */
  ADMIN_STATS_UPDATED: "admin:stats_updated",
};

export const ROOM = {
  PUBLIC: "public",
  ADMIN: "admin",
  user: (id) => `u:${id}`,
};

/* ============================================================
   الربط والمصادقة
============================================================ */

/**
 * يربط خادم Socket.IO ويثبّت قواعد الانضمام للغرف.
 * @param {import("socket.io").Server} socketServer
 * @param {(rawToken:string)=>object|null} resolveUser
 */
export function attachRealtime(socketServer, resolveUser) {
  io = socketServer;

  io.on("connection", (socket) => {
    /* [RT-4] كل متصل ينضم للغرفة العامة — حتى الزوار يرون تحديثات المحتوى */
    socket.join(ROOM.PUBLIC);

    const raw =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.cookie
        ?.split(";")
        .map((s) => s.trim())
        .find((s) => s.startsWith(`${config.sessionCookieName}=`))
        ?.slice(config.sessionCookieName.length + 1) ||
      "";

    const user = raw && resolveUser ? resolveUser(raw) : null;

    if (user) {
      socket.userId = user.id;
      socket.userRole = user.role;
      socket.join(ROOM.user(user.id));
      if (user.role === "admin") socket.join(ROOM.ADMIN);
    }

    socket.emit("ready", {
      userId: user?.id || null,
      role: user?.role || null,
      rooms: user ? [ROOM.PUBLIC, ROOM.user(user.id), ...(user.role === "admin" ? [ROOM.ADMIN] : [])] : [ROOM.PUBLIC],
    });

    logger.debug("socket connected", { id: socket.id, user: user?.id || null, role: user?.role || null });
  });

  logger.info("realtime attached", { rooms: ["public", "u:{userId}", "admin"] });
  return io;
}

export function getIO() {
  return io;
}

/* ============================================================
   دوال البث
============================================================ */
const stamp = (payload = {}) => ({ ...payload, at: new Date().toISOString() });

/** [RT-2] بث لكل المتصلين (محتوى عام) */
export function emitToAll(event, payload = {}) {
  if (!io) return false;
  try {
    io.to(ROOM.PUBLIC).emit(event, stamp(payload));
    return true;
  } catch (e) {
    logger.warn("emitToAll failed", { event, message: e.message });
    return false;
  }
}

/** [RT-2] بث لمستخدم بعينه */
export function emitToUser(userId, event, payload = {}) {
  if (!io || !userId) return false;
  try {
    io.to(ROOM.user(userId)).emit(event, stamp(payload));
    return true;
  } catch (e) {
    logger.warn("emitToUser failed", { event, message: e.message });
    return false;
  }
}

/** [RT-5] بث لغرفة الإدارة */
export function emitToAdmins(event, payload = {}) {
  if (!io) return false;
  try {
    io.to(ROOM.ADMIN).emit(event, stamp(payload));
    return true;
  } catch (e) {
    logger.warn("emitToAdmins failed", { event, message: e.message });
    return false;
  }
}

/** عدد الاتصالات الحالية (للفحص والمراقبة) */
export function connectionCount() {
  if (!io) return 0;
  try {
    return io.engine?.clientsCount ?? 0;
  } catch {
    return 0;
  }
}

/* ============================================================
   مساعدات عالية المستوى — تُستدعى من المسارات بعد نجاح الكتابة
============================================================ */

/** [RT-2] عرض تغيّر → للعلن + للوحة */
export const broadcastOffer = (kind, offer) => {
  emitToAll(kind, offer);
  statsDirty("offer");
};

/** [RT-5] يطلب من اللوحة إعادة حساب الإحصاءات */
export function statsDirty(reason = "change") {
  emitToAdmins(EV.ADMIN_STATS_UPDATED, { reason });
}
