import { run, one, all, now } from "../db.js";
import { uid, unreadCount } from "../lib/util.js";
import { logEvent } from "./events.js";
import { emitToUser, EV } from "./realtime.js";
import logger from "../lib/logger.js";

/**
 * محرك الإشعارات — مستقل عن العملية الأساسية.
 *  - منع تكرار نفس الحدث لنفس المستلم خلال دقيقة (dedupe_key).
 *  - فشل الإنشاء يسجَّل كحدث فشل ولا يفشل العملية.
 *  - [RT-1] كل إشعار ناجح يُبث فوراً عبر Socket.IO إلى غرفة المستخدم
 *    بالحدث notification:new، فتتحدث الشارة بدون reload ولا polling.
 */

/**
 * @returns {{id?:string, deduped?:boolean, failed?:boolean}}
 */
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
  if (!userId) return { failed: true };
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
      String(title || "").slice(0, 160),
      String(body || "").slice(0, 1000),
      entityType,
      entityId,
      dedupeKey ? `${dedupeKey}` : null,
      now(),
    );

    /* [RT-1] بث فوري مع العدد المحدث لغير المقروء */
    emitToUser(userId, EV.NOTIFICATION_NEW, {
      id: noticeId,
      type,
      title: String(title || "").slice(0, 160),
      body: String(body || "").slice(0, 1000),
      entityType,
      entityId,
      unread: unreadCount(userId),
    });

    return { id: noticeId };
  } catch (e) {
    logger.error("notification create failed", { message: e.message, userId });
    logEvent({
      type: "notification.failed",
      actorType: "system",
      details: { target: userId, title, reason: e.message, type },
      ip,
    });
    return { failed: true };
  }
}

/** يرسل نفس الإشعار لكل الأدمن النشطين */
export function notifyAdmins({ type, title, body, entityType, entityId, exclude = [], ip = "" }) {
  const admins = all("SELECT id FROM users WHERE role='admin' AND active=1");
  return admins
    .filter((a) => !exclude.includes(a.id))
    .map((a) => createNotification({ userId: a.id, type, title, body, entityType, entityId, ip }));
}

export function markRead(userId, noticeId) {
  const r = run("UPDATE notifications SET read=1 WHERE id=? AND user_id=?", noticeId, userId);
  if (!Number(r.changes)) return false;
  /* نحدّث الشارة فوراً في كل أجهزته */
  emitToUser(userId, EV.NOTIFICATION_NEW, { id: noticeId, read: true, unread: unreadCount(userId) });
  logEvent({
    type: "notification.read",
    actorType: "user",
    actorId: userId,
    entityType: "notification",
    entityId: noticeId,
  });
  return true;
}

export function markAllRead(userId) {
  const r = run("UPDATE notifications SET read=1 WHERE user_id=? AND read=0", userId);
  const count = Number(r.changes || 0);
  if (count) emitToUser(userId, EV.NOTIFICATION_NEW, { allRead: true, unread: 0 });
  logEvent({ type: "notification.read_all", actorType: "user", actorId: userId, details: { count } });
  return count;
}

export function retryNotification(noticeId, admin) {
  const n = one("SELECT * FROM notifications WHERE id=?", noticeId);
  if (!n) return { error: "الإشعار غير موجود" };
  if (n.status === "sent") return { error: "الإشعار مُرسل بالفعل" };
  run("UPDATE notifications SET status='sent', read=0, retry_count=retry_count+1 WHERE id=?", noticeId);
  emitToUser(n.user_id, EV.NOTIFICATION_NEW, {
    id: n.id,
    type: n.type,
    title: n.title,
    body: n.body,
    unread: unreadCount(n.user_id),
  });
  logEvent({
    type: "notification.retry",
    actorType: "admin",
    actorId: admin.id,
    actorName: admin.name,
    entityType: "notification",
    entityId: noticeId,
    details: { target: n.user_id },
  });
  return { ok: true };
}
