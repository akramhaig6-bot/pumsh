import { run, one, all, tx, now } from "../db.js";
import { uid } from "../lib/util.js";

/**
 * آلة حالات الطلب — 9 حالات وفق الوثيقة حرفياً.
 * كل انتقال يتحقق من: وجود الكيان + الحالة الحالية + صلاحية الفاعل + إصدار (version).
 */
export const REQUEST_STATUSES = [
  "new", "review", "info_waiting", "info_complete",
  "accepted", "rejected", "cancelled", "completed", "closed",
];

export const TRANSITIONS = {
  new: { review: "admin", cancelled: "both" },
  review: { info_waiting: "admin", accepted: "admin", rejected: "admin", cancelled: "admin" },
  info_waiting: { info_complete: "client", cancelled: "both" },
  info_complete: { review: "admin", info_waiting: "admin", accepted: "admin", rejected: "admin", cancelled: "admin" },
  accepted: { completed: "admin", cancelled: "admin" },
  completed: { closed: "admin" },
};
export const FINAL = ["rejected", "cancelled", "closed"];

export function detail(requestId) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) return null;
  const offer = one("SELECT * FROM offers WHERE id=?", r.offer_id);
  const user = one("SELECT id,name,email,phone,active,created_at FROM users WHERE id=?", r.user_id);
  const history = all(
    `SELECT * FROM request_history WHERE request_id=? ORDER BY created_at ASC`,
    requestId,
  );
  const info = all(`SELECT * FROM request_info WHERE request_id=? ORDER BY created_at DESC`, requestId);
  const tickets = one(
    `SELECT COUNT(*) c FROM tickets WHERE request_id=? AND user_id=?`,
    requestId,
    r.user_id,
  );
  return { ...r, offer, user, history, info, ticketCount: Number(tickets.c) };
}

function actorRow(byType, byId, byName) {
  return { by_type: byType, by_id: byId, by_name: byName };
}

/**
 * تنفيذ انتقال حالة طلب.
 * @param {string} requestId
 * @param {string} to
 * @param {{byType:'client'|'admin', byId:string, byName:string}} actor
 * @param {{note?:string, reason?:string, kind?:'info'|'reject'|'cancel'}} opts
 */
export function transition(requestId, to, actor, opts = {}) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) throw httpError(404, "الطلب لم يعد موجوداً");
  const allowed = TRANSITIONS[r.status]?.[to];
  if (!allowed) throw httpError(409, "لا يمكن تنفيذ هذا الإجراء على الطلب في وضعه الحالي، يرجى تحديث الصفحة لعرض الوضع الحالي");
  if (allowed !== "both" && allowed !== actor.byType)
    throw httpError(403, "عذراً، هذا الإجراء غير متاح لحسابك");

  const updatedAt = now();
  run(
    `UPDATE requests SET status=?, version=version+1, updated_at=?,
       reject_reason=coalesce(?,reject_reason),
       cancel_reason=coalesce(?,cancel_reason),
       info_note=coalesce(?,info_note)
     WHERE id=?`,
    to,
    updatedAt,
    to === "rejected" ? (opts.reason || null) : null,
    to === "cancelled" ? (opts.reason || null) : null,
    to === "info_waiting" ? (opts.note || null) : null,
    requestId,
  );
  run(
    `INSERT INTO request_history (id,request_id,from_status,to_status,by_type,by_id,by_name,note,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    uid("RH"),
    requestId,
    r.status,
    to,
    actor.byType,
    actor.byId,
    actor.byName,
    opts.note || opts.reason || "",
    updatedAt,
  );
  return detail(requestId);
}

/** استكمال معلومات العميل: بانتظار معلومات → مكتمل المعلومات */
export function completeInfo(requestId, actor, reply, files = []) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) throw httpError(404, "الطلب لم يعد موجوداً");
  if (r.status !== "info_waiting")
    throw httpError(409, "انتهت مرحلة استكمال المعلومات لهذا الطلب، يرجى فتح تذكرة دعم للمتابعة");
  tx(() => {
    run(
      `INSERT INTO request_info (id,request_id,reply,files,created_at) VALUES (?,?,?,?,?)`,
      uid("RI"),
      requestId,
      reply,
      JSON.stringify(files),
      now(),
    );
    run("UPDATE requests SET status='info_complete', version=version+1, updated_at=? WHERE id=?", now(), requestId);
    run(
      `INSERT INTO request_history (id,request_id,from_status,to_status,by_type,by_id,by_name,note,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      uid("RH"),
      requestId,
      "info_waiting",
      "info_complete",
      "client",
      actor.byId,
      actor.byName,
      reply.slice(0, 300),
      now(),
    );
  });
  return detail(requestId);
}

export function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}
