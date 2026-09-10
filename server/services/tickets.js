import { run, one, all, now } from "../db.js";
import { uid } from "../lib/util.js";
import { httpError } from "./requests.js";
import { registerTicketFiles, registerTicketReplyFiles, unregisterAttachments } from "./attachments.js";
import { emitToUser, emitToAdmins, statsDirty, EV } from "./realtime.js";

/**
 * آلة حالات التذكرة — 6 حالات.
 * قرار التصميم: يُسمح للعميل بإضافة ردود في «بانتظار رد الإدارة» دون تغيير الحالة.
 * كل رد/تغيير حالة يُبث لحظياً [RT-1].
 */
export const TICKET_STATUSES = ["open", "processing", "waiting_client", "waiting_admin", "closed", "reopened"];

export function detail(ticketId, viewer) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) return null;
  if (viewer?.role === "client" && t.user_id !== viewer.id) return null; // عدم كشف
  const user = one("SELECT id,name,email,phone,active,created_at FROM users WHERE id=?", t.user_id);
  const assignee = t.assigned_to ? one("SELECT id,name FROM users WHERE id=?", t.assigned_to) : null;
  const req = t.request_id ? one("SELECT id,seq,status,offer_id FROM requests WHERE id=?", t.request_id) : null;
  const offer = req ? one("SELECT id,title,status FROM offers WHERE id=?", req.offer_id) : null;
  const replies = all(
    "SELECT id,ticket_id,by_type,by_id,by_name,text,files,created_at FROM ticket_replies WHERE ticket_id=? ORDER BY created_at ASC",
    ticketId,
  );
  return { ...t, user, assignee, request: req ? { ...req, offer } : null, replies };
}

/** إضافة رد — يعالج الحالات ويحسب الحالة التالية تلقائياً */
export function addReply(ticketId, actor, text, files = []) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) throw httpError(404, "التذكرة غير موجودة");

  const reopen = actor.byType === "client" && t.status === "closed";
  if (actor.byType === "client") {
    if (reopen) {
      updateStatus(t, "reopened", actor);
    } else if (!["open", "processing", "waiting_client", "waiting_admin", "reopened"].includes(t.status)) {
      throw httpError(409, "لا يمكن إضافة رد على التذكرة في وضعها الحالي");
    }
  } else if (!["open", "processing", "waiting_client", "waiting_admin", "reopened"].includes(t.status)) {
    throw httpError(409, "لا يمكن الرد على التذكرة في وضعها الحالي");
  }

  /* الحالة التالية */
  let to;
  if (actor.byType === "admin") {
    to = "waiting_client";
  } else if (reopen) {
    to = "waiting_admin";
  } else {
    to = "waiting_admin";
  }

  if (actor.byType === "admin" && t.status === "open") updateStatus(t, "processing", actor);

  const noChange = actor.byType === "client" && t.status === "waiting_admin" && !reopen;
  if (!noChange && to !== t.status) updateStatus(t, to, actor);

  const replyId = uid("TR");
  const at = now();
  run(
    `INSERT INTO ticket_replies (id,ticket_id,by_type,by_id,by_name,text,files,created_at)
     VALUES (?,?,?,?,?,?,?,?)`,
    replyId, ticketId, actor.byType, actor.byId, actor.byName, text, JSON.stringify(files), at,
  );
  run("UPDATE tickets SET version=version+1, updated_at=? WHERE id=?", at, ticketId);

  /* [M14] تسجيل المرفقات في السجل المفهرس */
  registerTicketReplyFiles(files, replyId, actor.byId);

  /* [RT-1] بث الرد للطرف الآخر */
  const payload = {
    ticketId,
    seq: t.seq,
    subject: t.subject,
    replyId,
    byType: actor.byType,
    byName: actor.byName,
    text: String(text).slice(0, 500),
    files: files.length,
    status: one("SELECT status FROM tickets WHERE id=?", ticketId).status,
    reopened: reopen,
  };
  if (actor.byType === "admin") emitToUser(t.user_id, EV.TICKET_REPLY_ADDED, payload);
  else emitToAdmins(EV.TICKET_REPLY_ADDED, payload);
  statsDirty("ticket");

  return detail(ticketId, { id: t.user_id, role: "client" });
}

export function closeTicket(ticketId, actor) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) throw httpError(404, "التذكرة غير موجودة");
  if (t.status === "closed") throw httpError(409, "التذكرة مغلقة بالفعل");
  updateStatus(t, "closed", actor);
  statsDirty("ticket");
  return detail(ticketId, { id: t.user_id, role: "client" });
}

/** تعيين مسؤول عن التذكرة */
export function assignTicket(ticketId, adminId) {
  const t = one("SELECT * FROM tickets WHERE id=?", ticketId);
  if (!t) throw httpError(404, "التذكرة غير موجودة");
  const a = one("SELECT id,name FROM users WHERE id=? AND role='admin'", adminId);
  if (!a) throw httpError(422, "المشرف المحدد غير صالح");
  run("UPDATE tickets SET assigned_to=?, version=version+1, updated_at=? WHERE id=?", a.id, now(), t.id);

  const payload = { ticketId, seq: t.seq, assigned_to: a.id, assigned_name: a.name };
  emitToUser(t.user_id, EV.TICKET_ASSIGNED, payload);
  emitToAdmins(EV.TICKET_ASSIGNED, payload);
  statsDirty("ticket");
  return detail(ticketId, { id: t.user_id, role: "client" });
}

/** إنشاء تذكرة جديدة */
export function createTicket({ id, seq, userId, requestId, subject, message, files, userName }) {
  const at = now();
  run(
    `INSERT INTO tickets (id,seq,user_id,request_id,subject,message,files,status,version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'open',1,?,?)`,
    id, seq, userId, requestId || null, subject, message, JSON.stringify(files), at, at,
  );
  registerTicketFiles(files, id, userId);
  emitToAdmins(EV.TICKET_CREATED, { ticketId: id, seq, subject, user_name: userName });
  statsDirty("ticket");
}

export function deleteTicket(ticketId) {
  const replyPaths = all("SELECT files FROM ticket_replies WHERE ticket_id=?", ticketId);
  unregisterAttachments("ticket", ticketId);
  run("DELETE FROM tickets WHERE id=?", ticketId);
  statsDirty("ticket");
  return replyPaths;
}

function updateStatus(t, to, actor) {
  const at = now();
  run("UPDATE tickets SET status=?, version=version+1, updated_at=? WHERE id=?", to, at, t.id);
  logTicketEvent(t.id, t.status, to, actor);

  /* [RT-1] بث تغيير الحالة للطرف المعني */
  const payload = { ticketId: t.id, seq: t.seq, from: t.status, status: to };
  if (actor.byType === "admin") emitToUser(t.user_id, EV.TICKET_STATUS_CHANGED, payload);
  else emitToAdmins(EV.TICKET_STATUS_CHANGED, payload);
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
