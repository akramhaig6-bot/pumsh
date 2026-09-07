import { run, one, all, now } from "../db.js";
import { uid } from "../lib/util.js";
import { httpError } from "./requests.js";

/**
 * آلة حالات التذكرة — 6 حالات (مفتوحة، قيد المعالجة، بانتظار العميل، بانتظار الإدارة، مغلقة، معاد فتحها).
 * قرار التصميم النهائي: العميل يسمح له بإضافة ردود إضافية في "بانتظار رد الإدارة" دون تغيير الحالة.
 */
export const TICKET_STATUSES = ["open", "processing", "waiting_client", "waiting_admin", "closed", "reopened"];

export function detail(ticketId, viewer) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) return null;
  if (viewer.role === "client" && t.user_id !== viewer.id)
    return null; // عدم كشف
  const user = one("SELECT id,name,email,phone,active,created_at FROM users WHERE id=?", t.user_id);
  const req = t.request_id
    ? one("SELECT id,status,offer_id FROM requests WHERE id=?", t.request_id)
    : null;
  const offer = req ? one("SELECT id,title,status FROM offers WHERE id=?", req.offer_id) : null;
  const replies = all("SELECT * FROM ticket_replies WHERE ticket_id=? ORDER BY created_at ASC", ticketId);
  return { ...t, user, request: req ? { ...req, offer } : null, replies };
}

/** إضافة رد — يعالج الحالات ويحسب الحالة التالية تلقائياً */
export function addReply(ticketId, actor, text, files = []) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) throw httpError(404, "التذكرة غير موجودة");
  if (actor.byType === "client") {
    if (t.status === "closed") {
      // إعادة فتح: مغلقة → معاد فتحها (ثم تعامل كبانتظار رد الإدارة)
      updateStatus(t, "reopened", actor);
    } else if (!["open", "processing", "waiting_client", "waiting_admin", "reopened"].includes(t.status)) {
      throw httpError(409, "لا يمكن إضافة رد في الحالة الحالية");
    }
  } else {
    if (!["open", "processing", "waiting_admin", "reopened"].includes(t.status))
      throw httpError(409, "لا يمكن الرد في هذه الحالة؛ يمكنك إغلاق التذكرة فقط");
  }

  const to =
    actor.byType === "admin"
      ? t.status === "open"
        ? "waiting_client" // مفتوحة → قيد المعالجة → بانتظار العميل (يُسجل انتقالان)
        : "waiting_client"
      : t.status === "closed"
        ? "waiting_admin" // بعد معاد فتحها
        : t.status === "waiting_admin"
          ? "waiting_admin" // قرار التصميم: إضافة دون تغيير
          : "waiting_admin";

  if (actor.byType === "admin" && t.status === "open") {
    updateStatus(t, "processing", actor);
  }
  if (to !== t.status && !(actor.byType === "client" && t.status === "waiting_admin")) {
    updateStatus(t, to, actor);
  }

  run(
    `INSERT INTO ticket_replies (id,ticket_id,by_type,by_id,by_name,text,files,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    uid("TR"),
    ticketId,
    actor.byType,
    actor.byId,
    actor.byName,
    text,
    JSON.stringify(files),
    now(),
  );
  run("UPDATE tickets SET version=version+1, updated_at=? WHERE id=?", now(), ticketId);
  return detail(ticketId, { id: t.user_id, role: "client" });
}

export function closeTicket(ticketId, actor) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) throw httpError(404, "التذكرة غير موجودة");
  if (t.status === "closed") throw httpError(409, "التذكرة مغلقة بالفعل");
  updateStatus(t, "closed", actor);
  return detail(ticketId, { id: t.user_id, role: "client" });
}

function updateStatus(t, to, actor) {
  run(
    "UPDATE tickets SET status=?, version=version+1, updated_at=? WHERE id=?",
    to,
    now(),
    t.id,
  );
  logTicketEvent(t.id, t.status, to, actor);
}

function logTicketEvent(ticketId, from, to, actor) {
  run(
    `INSERT INTO events (id,type,actor_type,actor_id,actor_name,entity_type,entity_id,entity_label,details,created_at)
     VALUES (?,?,?,?,?,?,?,?,?,?)`,
    uid("EV"),
    "ticket.transition",
    actor.byType,
    actor.byId,
    actor.byName,
    "ticket",
    ticketId,
    null,
    JSON.stringify({ from, to }),
    now(),
  );
}
