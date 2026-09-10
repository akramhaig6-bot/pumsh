import { run, one, all, tx, now } from "../db.js";
import { uid } from "../lib/util.js";
import {
  registerRequestFiles,
  registerRequestInfoFiles,
  unregisterAttachments,
} from "./attachments.js";
import { emitToUser, emitToAdmins, statsDirty, EV } from "./realtime.js";

/**
 * آلة حالات الطلب — 9 حالات.
 * كل انتقال يتحقق من: وجود الكيان + الحالة الحالية + صلاحية الفاعل + إصدار (version).
 * بعد كل انتقال ناجح يُبث الحدث لحظياً [RT-1].
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

export function httpError(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

export function detail(requestId) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) return null;
  const offer = one("SELECT id,title,summary,image,status,start_date,end_date FROM offers WHERE id=?", r.offer_id);
  const user = one("SELECT id,name,email,phone,active,created_at FROM users WHERE id=?", r.user_id);
  const assignee = r.assigned_to
    ? one("SELECT id,name FROM users WHERE id=?", r.assigned_to)
    : null;
  const history = all(
    "SELECT id,from_status,to_status,by_type,by_name,note,created_at FROM request_history WHERE request_id=? ORDER BY created_at ASC",
    requestId,
  );
  const info = all(
    "SELECT id,request_id,reply,files,created_at FROM request_info WHERE request_id=? ORDER BY created_at DESC",
    requestId,
  );
  const tickets = one("SELECT COUNT(*) c FROM tickets WHERE request_id=? AND user_id=?", requestId, r.user_id);
  return { ...r, offer, user, assignee, history, info, ticketCount: Number(tickets.c) };
}

/**
 * تنفيذ انتقال حالة طلب + سجل حركة + بث لحظي.
 */
export function transition(requestId, to, actor, opts = {}) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) throw httpError(404, "الطلب لم يعد موجوداً");

  const allowed = TRANSITIONS[r.status]?.[to];
  if (!allowed)
    throw httpError(409, "لا يمكن تنفيذ هذا الإجراء على الطلب في وضعه الحالية، يرجى تحديث الصفحة لعرض الوضع الحالي");
  if (allowed !== "both" && allowed !== actor.byType)
    throw httpError(403, "عذراً، هذا الإجراء غير متاح لحسابك");

  const updatedAt = now();
  const note = opts.note || opts.reason || "";

  tx(() => {
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
      String(note).slice(0, 300),
      updatedAt,
    );
  });

  /* [RT-1] بث التغيير لصاحب الطلب + للوحة الإدارة */
  const payload = {
    id: requestId,
    seq: r.seq,
    from: r.status,
    status: to,
    note: String(note).slice(0, 500),
    reason: (opts.reason || "").slice(0, 500),
    offer_id: r.offer_id,
  };
  emitToUser(r.user_id, EV.REQUEST_STATUS_CHANGED, payload);
  emitToAdmins(EV.REQUEST_STATUS_CHANGED, payload);

  if (to === "info_waiting") {
    emitToUser(r.user_id, EV.REQUEST_INFO_REQUESTED, {
      id: requestId,
      seq: r.seq,
      note: String(opts.note || "").slice(0, 1000),
    });
  }
  if (to === "cancelled") {
    emitToUser(r.user_id, EV.REQUEST_CANCELLED, { id: requestId, seq: r.seq, reason: (opts.reason || "").slice(0, 500) });
  }
  statsDirty("request");

  return detail(requestId);
}

/** استكمال معلومات العميل: بانتظار معلومات → مكتمل المعلومات */
export function completeInfo(requestId, actor, reply, files = []) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) throw httpError(404, "الطلب لم يعد موجوداً");
  if (r.status !== "info_waiting")
    throw httpError(409, "انتهت مرحلة استكمال المعلومات لهذا الطلب، يرجى فتح تذكرة دعم للمتابعة");

  const infoId = uid("RI");
  const at = now();

  tx(() => {
    run(
      "INSERT INTO request_info (id,request_id,reply,files,created_at) VALUES (?,?,?,?,?)",
      infoId,
      requestId,
      reply,
      JSON.stringify(files),
      at,
    );
    run(
      "UPDATE requests SET status='info_complete', version=version+1, updated_at=? WHERE id=?",
      at,
      requestId,
    );
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
      String(reply).slice(0, 300),
      at,
    );
    /* [M14] تسجيل المرفقات في السجل المفهرس */
    registerRequestInfoFiles(files, infoId, actor.byId);
  });

  /* [RT-1] يظهر الرد الجديد فوراً عند الأدمن */
  emitToAdmins(EV.REQUEST_NOTE_ADDED, {
    requestId,
    seq: r.seq,
    infoId,
    by: "client",
    byName: actor.byName,
    reply: String(reply).slice(0, 500),
    files: files.length,
  });
  emitToUser(r.user_id, EV.REQUEST_STATUS_CHANGED, {
    id: requestId,
    seq: r.seq,
    from: "info_waiting",
    status: "info_complete",
  });
  statsDirty("request");

  return detail(requestId);
}

/** تعيين مسؤول عن الطلب */
export function assignRequest(requestId, adminId, actorName) {
  const r = one("SELECT * FROM requests WHERE id=?", requestId);
  if (!r) throw httpError(404, "الطلب لم يعد موجوداً");
  const a = one("SELECT id,name FROM users WHERE id=? AND role='admin'", adminId);
  if (!a) throw httpError(422, "المشرف المحدد غير صالح");

  run("UPDATE requests SET assigned_to=?, version=version+1, updated_at=? WHERE id=?", a.id, now(), requestId);

  const payload = { id: requestId, seq: r.seq, assigned_to: a.id, assigned_name: a.name };
  emitToUser(r.user_id, EV.REQUEST_ASSIGNED, payload);
  emitToAdmins(EV.REQUEST_ASSIGNED, payload);
  statsDirty("request");
  return detail(requestId);
}

/** إنشاء طلب جديد — يُسجّل المرفقات ويبث للوحة */
export function createRequest({ id, seq, offerId, userId, notes, files, userName }) {
  const at = now();
  tx(() => {
    run(
      `INSERT INTO requests (id,seq,offer_id,user_id,notes,files,status,version,created_at,updated_at)
       VALUES (?,?,?,?,?,?,'new',1,?,?)`,
      id, seq, offerId, userId, notes, JSON.stringify(files), at, at,
    );
    run(
      `INSERT INTO request_history (id,request_id,from_status,to_status,by_type,by_id,by_name,note,created_at)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      uid("RH"), id, null, "new", "client", userId, userName, String(notes).slice(0, 300), at,
    );
    registerRequestFiles(files, id, userId);
  });
  emitToAdmins(EV.REQUEST_CREATED, { id, seq, offer_id: offerId, user_name: userName });
  statsDirty("request");
}

/** حذف طلب مع مرفقاته */
export function deleteRequest(requestId) {
  const paths = unregisterAttachments("request", requestId);
  run("DELETE FROM requests WHERE id=?", requestId);
  statsDirty("request");
  return paths;
}
