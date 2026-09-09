import { Router } from "express";
import { run, one, all, now } from "../db.js";
import { uid, pager, jsonParse } from "../lib/util.js";
import { parse, failure, asyncH, requireAuth, requestIp } from "../lib/http.js";
import { uploader, validateFile, toAttachment, toPublicAttachment } from "../lib/upload.js";
import { requestSchema, infoSchema, ticketSchema, replySchema } from "../lib/validate.js";
import { logEvent } from "../services/events.js";
import { createNotification, notifyAdmins, markRead, markAllRead } from "../services/notify.js";
import { detail as reqDetail, transition, completeInfo } from "../services/requests.js";
import { detail as tDetail, addReply, closeTicket } from "../services/tickets.js";
import { getSettings } from "../services/settings.js";

export const client = Router();
client.use(requireAuth);
client.use((req, res, next) => {
  if (req.user?.role !== "client" && !req.path.startsWith("/notification"))
    return failure(res, 404, "الصفحة غير موجودة");
  next();
});

/* =============== الطلبات =============== */

client.get("/requests", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const status = String(req.query.status || "");
  const rows = all(
    `SELECT r.*, o.title offer_title, o.status offer_status FROM requests r
     LEFT JOIN offers o ON o.id=r.offer_id
     WHERE r.user_id=? ${status ? "AND r.status=?" : ""}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    req.user.id, ...(status ? [status] : []), per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM requests WHERE user_id=? ${status ? "AND status=?" : ""}`,
    req.user.id, ...(status ? [status] : []),
  ).c;
  res.json({ ok: true, requests: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

client.get("/requests/:id", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d || d.user_id !== req.user.id) {
    logEvent({ type: "user.unauthorized", actorType: "client", actorId: req.user.id, actorName: req.user.name, details: { target: `request:${req.params.id}` }, ip: requestIp(req) });
    return failure(res, 404, "الطلب غير موجود أو ليس لديك صلاحية للوصول إليه");
  }
  res.json({ ok: true, request: serialize(d) });
});

client.post("/requests", uploader.array("files", 8), asyncH(async (req, res) => {
  const r = parse(requestSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const offer = one("SELECT * FROM offers WHERE id=?", r.value.offer_id);
  if (!offer || offer.status !== "published")
    return failure(res, 409, "العرض لم يعد متاحاً حالياً");
  const active = one(
    `SELECT id,status FROM requests WHERE user_id=? AND offer_id=? AND status NOT IN ('cancelled','rejected','closed') LIMIT 1`,
    req.user.id, offer.id,
  );
  if (active) return failure(res, 409, "لديك طلب جارٍ لهذا العرض بالفعل", { requestId: active.id });

  const files = [];
  for (const f of req.files || []) {
    const err = validateFile(f);
    if (err) return failure(res, 422, err);
    files.push(toAttachment(f));
  }

  const id = uid("REQ");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM requests").c);
  run(
    `INSERT INTO requests (id,seq,offer_id,user_id,notes,files,status,version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,'new',1,?,?)`,
    id, seq, offer.id, req.user.id, r.value.notes, JSON.stringify(files), now(), now(),
  );
  run(
    `INSERT INTO request_history (id,request_id,from_status,to_status,by_type,by_id,by_name,note,created_at)
     VALUES (?,?,?,?,?,?,?,?,?)`,
    uid("RH"), id, null, "new", "client", req.user.id, req.user.name, r.value.notes.slice(0, 300), now(),
  );
  logEvent({
    type: "request.create", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: id, entityLabel: offer.title, details: { offer_id: offer.id, files: files.length }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "request", title: "طلب جديد", body: `طلب جديد من العميل ${req.user.name} على العرض «${offer.title}»`,
    entityType: "request", entityId: id, ip: requestIp(req),
  });
  res.json({ ok: true, request: serialize(reqDetail(id)) });
}));

client.post("/requests/:id/cancel", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d || d.user_id !== req.user.id) return failure(res, 404, "الطلب غير موجود أو ليس لديك صلاحية للوصول إليه");
  if (d.status === "new" || d.status === "info_waiting") {
    if (req.body?.reason && String(req.body.reason).length < 3)
      return failure(res, 422, "يرجى كتابة سبب الإلغاء (3 أحرف على الأقل)");
    const after = transition(d.id, "cancelled", { byType: "client", byId: req.user.id, byName: req.user.name }, { reason: req.body?.reason || "" });
    logEvent({
      type: "request.transition", actorType: "client", actorId: req.user.id, actorName: req.user.name,
      entityType: "request", entityId: d.id, entityLabel: d.offer?.title, details: { from: d.status, to: "cancelled", by: "client" }, ip: requestIp(req),
    });
    notifyAdmins({
      type: "request", title: "ألغى العميل طلبه", body: `العميل ${req.user.name} ألغى طلبه رقم ${d.seq ?? d.id}`,
      entityType: "request", entityId: d.id, ip: requestIp(req),
    });
    return res.json({ ok: true, request: serialize(after) });
  }
  return failure(res, 409, "لا يمكن إلغاء الطلب في مرحلته الحالية، يمكنك التواصل معنا للمساعدة", { request: serialize(d) });
});

client.post("/requests/:id/info", uploader.array("files", 8), asyncH(async (req, res) => {
  const r = parse(infoSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const d = reqDetail(req.params.id);
  if (!d || d.user_id !== req.user.id) return failure(res, 404, "الطلب غير موجود أو ليس لديك صلاحية للوصول إليه");
  if (d.status !== "info_waiting")
    return failure(res, 409, "انتهت مرحلة استكمال المعلومات لهذا الطلب، يرجى فتح تذكرة دعم للمتابعة", { request: serialize(d) });
  const files = [];
  for (const f of req.files || []) {
    const err = validateFile(f);
    if (err) return failure(res, 422, err);
    files.push(toAttachment(f));
  }
  const after = completeInfo(d.id, { byId: req.user.id, byName: req.user.name }, r.value.reply, files);
  logEvent({
    type: "request.info_completed", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: d.id, entityLabel: d.offer?.title, details: { reply: r.value.reply.slice(0, 200), files: files.length }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "request", title: "العميل أرسل المعلومات المطلوبة", body: `العميل ${req.user.name} أرسل المعلومات الإضافية للطلب رقم ${d.seq ?? d.id}`,
    entityType: "request", entityId: d.id, ip: requestIp(req),
  });
  res.json({ ok: true, request: serialize(after) });
}));

/* =============== التذاكر =============== */

client.get("/tickets", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const status = String(req.query.status || "");
  const rows = all(
    `SELECT t.*, r.status request_status, o.title offer_title FROM tickets t
     LEFT JOIN requests r ON r.id=t.request_id LEFT JOIN offers o ON o.id=r.offer_id
     WHERE t.user_id=? ${status ? "AND t.status=?" : ""}
     ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    req.user.id, ...(status ? [status] : []), per, (page - 1) * per,
  );
  const total = one(`SELECT COUNT(*) c FROM tickets WHERE user_id=? ${status ? "AND status=?" : ""}`, req.user.id, ...(status ? [status] : [])).c;
  res.json({ ok: true, tickets: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

client.post("/tickets", uploader.array("files", 6), asyncH(async (req, res) => {
  const r = parse(ticketSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  if (r.value.request_id) {
    const own = one("SELECT id FROM requests WHERE id=? AND user_id=?", r.value.request_id, req.user.id);
    if (!own) return failure(res, 422, "الطلب المحدد غير صالح أو لا يتبع حسابك");
  }
  const files = [];
  for (const f of req.files || []) {
    const err = validateFile(f);
    if (err) return failure(res, 422, err);
    files.push(toAttachment(f));
  }
  const id = uid("TKT");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM tickets").c);
  run(
    `INSERT INTO tickets (id,seq,user_id,request_id,subject,message,files,status,version,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,'open',1,?,?)`,
    id, seq, req.user.id, r.value.request_id || null, r.value.subject, r.value.message, JSON.stringify(files), now(), now(),
  );
  logEvent({
    type: "ticket.create", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: id, entityLabel: r.value.subject, details: { request_id: r.value.request_id }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "support", title: "تذكرة دعم جديدة", body: `تذكرة جديدة من العميل ${req.user.name}: ${r.value.subject}`,
    entityType: "ticket", entityId: id, ip: requestIp(req),
  });
  res.json({ ok: true, ticket: tDetail(id, req.user) });
}));

client.get("/tickets/:id", (req, res) => {
  const t = tDetail(req.params.id, req.user);
  if (!t) return failure(res, 404, "التذكرة غير موجودة أو ليس لديك صلاحية للوصول إليها");
  res.json({ ok: true, ticket: serializeTicket(t) });
});

client.post("/tickets/:id/reply", uploader.array("files", 6), asyncH(async (req, res) => {
  const r = parse(replySchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const t = one("SELECT * FROM tickets WHERE id=?", req.params.id);
  if (!t || t.user_id !== req.user.id) return failure(res, 404, "التذكرة غير موجودة أو ليس لديك صلاحية للوصول إليها");
  const files = [];
  for (const f of req.files || []) {
    const err = validateFile(f);
    if (err) return failure(res, 422, err);
    files.push(toAttachment(f));
  }
  const wasClosed = t.status === "closed";
  const after = addReply(t.id, { byType: "client", byId: req.user.id, byName: req.user.name }, r.value.text, files);
  logEvent({
    type: wasClosed ? "ticket.reopen" : "ticket.reply", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject, details: { files: files.length }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "support",
    title: wasClosed ? "العميل أعاد فتح تذكرة" : "رد جديد من العميل",
    body: `العميل ${req.user.name} ${wasClosed ? "أعاد فتح" : "أضاف رداً على"} التذكرة رقم ${t.seq ?? t.id}: ${t.subject}`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });
  res.json({ ok: true, ticket: serializeTicket(after) });
}));

client.post("/tickets/:id/close", (req, res) => {
  const t = one("SELECT * FROM tickets WHERE id=?", req.params.id);
  if (!t || t.user_id !== req.user.id) return failure(res, 404, "التذكرة غير موجودة أو ليس لديك صلاحية للوصول إليها");
  const after = closeTicket(t.id, { byType: "client", byId: req.user.id, byName: req.user.name });
  logEvent({
    type: "ticket.close", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject, ip: requestIp(req),
  });
  notifyAdmins({
    type: "support", title: "أغلق العميل التذكرة", body: `العميل ${req.user.name} أغلق التذكرة رقم ${t.seq ?? t.id}: ${t.subject}`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });
  res.json({ ok: true, ticket: serializeTicket(after) });
});

/* =============== مساعدات تسلسل =============== */
function serialize(d) {
  if (!d) return null;
  return {
    ...d,
    files: (jsonParse(d.files, []) || []).map(toPublicAttachment),
    info: (d.info || []).map((i) => ({ ...i, files: (jsonParse(i.files, []) || []).map(toPublicAttachment) })),
  };
}
function serializeTicket(t) {
  if (!t) return null;
  return {
    ...t,
    files: (jsonParse(t.files, []) || []).map(toPublicAttachment),
    replies: (t.replies || []).map((r) => ({ ...r, files: (jsonParse(r.files, []) || []).map(toPublicAttachment) })),
  };
}
