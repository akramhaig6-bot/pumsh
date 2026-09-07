import { run, one, all, now } from "../db.js";
import { uid, unreadCount } from "../lib/util.js";
import { logEvent } from "./events.js";

/**
 * محرك الإشعارات — مستقل عن العملية الأساسية.
 * - منع تكرار نفس الحدث لنفس المستلم خلال دقيقة (dedupe_key).
 * - فشل الإنشاء يسجَّل كحدث فشل ولا يفشل العملية.
 * - الإشعارات الناجحة تُرسل فوراً عبر WebSocket إن كان المستلم متصلاً.
 */
let io = null;
export function attachIO(socketServer) {
  io = socketServer;
}

/** تمرير نسخة Socket.IO لخدمة الإشعارات من خارج الخدمة */
export function setIO(socketServer) {
  attachIO(socketServer);
}

/** إرسال إشعار فوري إلى مستخدم عبر الغرفة */
export function emitLive(userId, payload = {}) {
  try {
    if (!io) return null;
    io.to(`u:${userId}`).emit("notify", {
      ...payload,
      unread: unreadCount(userId),
    });
    return true;
  } catch {
    return null;
  }
}

export function createNotification({
  userId,
  type = "system",
  title,
  body,
  entityType = null,
  entityId = null,
  dedupeKey = null,
  ip = "",
}) {
  let noticeId = null;
  try {
    if (dedupeKey) {
      const dup = one(
        `SELECT id FROM notifications WHERE user_id=? AND dedupe_key=? AND created_at > ?`,
        userId,
        dedupeKey,
        new Date(Date.now() - 60_000).toISOString(),
      );
      if (dup) return { id: dup.id, deduped: true };
    }
    noticeId = uid("NT");
    run(
      `INSERT INTO notifications (id,user_id,type,title,body,entity_type,entity_id,dedupe_key,status,created_at)
       VALUES (?,?,?,?,?,?,?,?,'sent',?)`,
      noticeId,
      userId,
      type,
      title.slice(0, 160),
      body.slice(0, 1000),
      entityType,
      entityId,
      dedupeKey ? `${dedupeKey}` : null,
      now(),
    );
    emitLive(userId, { id: noticeId, title, body, type });
    return { id: noticeId };
  } catch (e) {
    console.error("[notify] فشل إنشاء إشعار", e.message);
    logEvent({
      type: "notification.failed",
      actorType: "system",
      details: { target: userId, title, reason: e.message, type },
      ip,
    });
    return { failed: true };
  }
}

export function notifyAdmins({ type, title, body, entityType, entityId, exclude = [], ip = "" }) {
  const admins = all("SELECT id FROM users WHERE role='admin' AND active=1");
  return admins
    .filter((a) => !exclude.includes(a.id))
    .map((a) => createNotification({ userId: a.id, type, title, body, entityType, entityId, ip }));
}

export function markRead(userId, noticeId) {
  run("UPDATE notifications SET read=1 WHERE id=? AND user_id=?", noticeId, userId);
  logEvent({
    type: "notification.read",
    actorType: "user",
    actorId: userId,
    entityType: "notification",
    entityId: noticeId,
    details: { title: "قراءة إشعار" },
  });
}

export function markAllRead(userId) {
  const r = run("UPDATE notifications SET read=1 WHERE user_id=? AND read=0", userId);
  logEvent({
    type: "notification.read_all",
    actorType: "user",
    actorId: userId,
    details: { count: Number(r.changes) },
  });
  return Number(r.changes);
}

export function retryNotification(noticeId, admin) {
  const n = one("SELECT * FROM notifications WHERE id=?", noticeId);
  if (!n) return { error: "الإشعار غير موجود" };
  if (n.status === "sent") return { error: "الإشعار مُرسل بالفعل" };
  run("UPDATE notifications SET status='sent', read=0, retry_count=retry_count+1 WHERE id=?", noticeId);
  emitLive(n.user_id, { id: n.id, title: n.title, body: n.body, type: n.type });
  logEvent({
    type: "notification.retry",
    actorType: "admin",
    actorId: admin.id,
    actorName: admin.name,
    entityType: "notification",
    entityId: noticeId,
    details: { target: n.user_id, title: n.title },
  });
  return { ok: true };
}

/* (emitLive معرفة أعلاه — إرسال فوري عبر WebSocket مع عداد غير المقروء) */
