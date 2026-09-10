import { Router } from "express";
import { one, all } from "../db.js";
import { uid, pager, pagination, jsonParse } from "../lib/util.js";
import { parse, failure, asyncH, requireAuth, requestIp } from "../lib/http.js";
import { uploader, consumeUploads, discardUploads, uploadCleanup, toPublicAttachment } from "../lib/upload.js";
import { requestSchema, infoSchema, ticketSchema, replySchema } from "../lib/validate.js";
import { logEvent } from "../services/events.js";
import { notifyAdmins } from "../services/notify.js";
import {
  detail as reqDetail, transition, completeInfo, createRequest, REQUEST_STATUSES,
} from "../services/requests.js";
import { detail as tDetail, addReply, closeTicket, createTicket, TICKET_STATUSES } from "../services/tickets.js";
import { config } from "../config.js";

export const client = Router();

/* ============================================================
   [X5] بوابة الدور

   كان الشرط:
       if (req.user?.role !== "client" && !req.path.startsWith("/notification"))
   أي أن أي مسار يبدأ بـ /notification كان مفتوحاً للأدمن أيضاً، والأخطر أن
   الصياغة كانت قابلة للكسر بمجرد إضافة مسار جديد يبدأ بالحرف نفسه.
   الآن: قائمة صريحة، وأي مسار خارجها مرفوض للأدمن بـ 404.
============================================================ */
const CLIENT_PREFIXES = ["/requests", "/tickets"];

client.use(requireAuth);
client.use((req, res, next) => {
  if (req.user?.role !== "client") return failure(res, 404, "الصفحة غير موجودة");
  if (!CLIENT_PREFIXES.some((p) => req.path === p || req.path.startsWith(p + "/")))
    return failure(res, 404, "الصفحة غير موجودة");
  next();
});
client.use(uploadCleanup);

/* ============================================================
   [M10] التسلسل

   كان: قائمة الطلبات تُرجع عمود `files` كما هو في القاعدة — نص JSON خام
   ("files":"[{\"path\":\"attachments/…\"}]") بلا اسم ولا حجم ولا رابط،
   والواجهة كانت تعرض سلسلة نصية بدل ملفات.
   الآن: كل استجابة تمرّ على serialize() نفسها — التفصيل والقائمة معاً.
============================================================ */
function filesOf(raw) {
  return (jsonParse(raw, []) || []).map(toPublicAttachment);
}

function serialize(d) {
  if (!d) return null;
  return {
    ...d,
    files: filesOf(d.files),
    info: (d.info || []).map((i) => ({ ...i, files: filesOf(i.files) })),
  };
}

function serializeTicket(t) {
  if (!t) return null;
  return {
    ...t,
    files: filesOf(t.files),
    replies: (t.replies || []).map((r) => ({ ...r, files: filesOf(r.files) })),
  };
}

/** يحوّل ملفات الرفع المؤقتة إلى سجلّات مرفقات جاهزة للحفظ */
function takeUploads(req, kind) {
  const { files, error } = consumeUploads(req, kind, { imagesOnly: false });
  return { files: error ? null : files.map((f) => ({ path: f.path, name: f.name, mime: f.mime, size: f.size })), error };
}

/* ============================================================
   الطلبات
============================================================ */
client.get("/requests", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const status = String(req.query.status || "");
  const valid = REQUEST_STATUSES.includes(status);

  const where = valid ? "r.user_id=? AND r.status=?" : "r.user_id=?";
  const args = valid ? [req.user.id, status] : [req.user.id];

  const rows = all(
    `SELECT r.id,r.seq,r.offer_id,r.notes,r.files,r.status,r.reject_reason,r.cancel_reason,
            r.info_note,r.assigned_to,r.version,r.created_at,r.updated_at,
            o.title offer_title, o.status offer_status, o.image offer_image
     FROM requests r LEFT JOIN offers o ON o.id=r.offer_id
     WHERE ${where}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(`SELECT COUNT(*) c FROM requests r WHERE ${where}`, ...args).c);

  res.json({
    ok: true,
    requests: rows.map((r) => ({ ...r, files: filesOf(r.files) })),
    pagination: pagination(page, per, total),
  });
});

client.get("/requests/:id", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d || d.user_id !== req.user.id) {
    logEvent({
      type: "user.unauthorized", actorType: "client", actorId: req.user.id, actorName: req.user.name,
      details: { target: `request:${req.params.id}` }, ip: requestIp(req),
    });
    return failure(res, 404, "الطلب غير موجود أو ليس لديك صلاحية للوصول إليه");
  }
  res.json({ ok: true, request: serialize(d) });
});

client.post("/requests", uploader.array("files", config.maxFilesPerRequest), asyncH(async (req, res) => {
  const r = parse(requestSchema, req.body);
  if (r.error) { discardUploads(req); return failure(res, 422, r.error, { fields: r.fields || {} }); }

  const offer = one("SELECT id,title,status FROM offers WHERE id=?", r.value.offer_id);
  if (!offer || offer.status !== "published") {
    discardUploads(req);
    return failure(res, 409, "العرض لم يعد متاحاً حالياً");
  }

  const active = one(
    "SELECT id,status FROM requests WHERE user_id=? AND offer_id=? AND status NOT IN ('done','rejected','cancelled') LIMIT 1",
    req.user.id, offer.id,
  );
  if (active) {
    discardUploads(req);
    return failure(res, 409, "لديك طلب جارٍ لهذا العرض بالفعل", { requestId: active.id });
  }

  const { files, error } = takeUploads(req, "attachments");
  if (error) return failure(res, 422, error);

  const id = uid("REQ");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM requests").c);

  /* createRequest يسجّل المرفقات داخل المعاملة نفسها — فلا نافذة يفشل فيها التنزيل [M15] */
  createRequest({
    id, seq, offerId: offer.id, userId: req.user.id,
    notes: r.value.notes, files, userName: req.user.name,
  });

  logEvent({
    type: "request.create", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: id, entityLabel: offer.title,
    details: { offer_id: offer.id, files: files.length }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "request", title: "طلب جديد",
    body: `طلب جديد من العميل ${req.user.name} على العرض «${offer.title}»`,
    entityType: "request", entityId: id, ip: requestIp(req),
  });

  res.json({ ok: true, request: serialize(reqDetail(id)) });
}));

client.post("/requests/:id/cancel", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d || d.user_id !== req.user.id)
    return failure(res, 404, "الطلب غير موجود أو ليس لديك صلاحية للوصول إليه");

  if (d.status === "new" || d.status === "info_waiting") {
    if (req.body?.reason && String(req.body.reason).length < 3)
      return failure(res, 422, "يرجى كتابة سبب الإلغاء (3 أحرف على الأقل)");

    const after = transition(
      d.id, "cancelled",
      { byType: "client", byId: req.user.id, byName: req.user.name },
      { reason: String(req.body?.reason || "") },
    );
    logEvent({
      type: "request.transition", actorType: "client", actorId: req.user.id, actorName: req.user.name,
      entityType: "request", entityId: d.id, entityLabel: d.offer?.title,
      details: { from: d.status, to: "cancelled", by: "client" }, ip: requestIp(req),
    });
    notifyAdmins({
      type: "request", title: "ألغى العميل طلبه",
      body: `العميل ${req.user.name} ألغى طلبه رقم ${d.seq ?? d.id}`,
      entityType: "request", entityId: d.id, ip: requestIp(req),
    });
    return res.json({ ok: true, request: serialize(after) });
  }

  return failure(res, 409, "لا يمكن إلغاء الطلب في مرحلته الحالية، يمكنك التواصل معنا للمساعدة", { request: serialize(d) });
});

client.post("/requests/:id/info", uploader.array("files", config.maxFilesPerRequest), asyncH(async (req, res) => {
  const r = parse(infoSchema, req.body);
  if (r.error) { discardUploads(req); return failure(res, 422, r.error, { fields: r.fields || {} }); }

  const d = reqDetail(req.params.id);
  if (!d || d.user_id !== req.user.id) {
    discardUploads(req);
    return failure(res, 404, "الطلب غير موجود أو ليس لديك صلاحية للوصول إليه");
  }
  if (d.status !== "info_waiting") {
    discardUploads(req);
    return failure(res, 409, "انتهت مرحلة استكمال المعلومات لهذا الطلب، يرجى فتح تذكرة دعم للمتابعة", { request: serialize(d) });
  }

  const { files, error } = takeUploads(req, "attachments");
  if (error) return failure(res, 422, error);

  const after = completeInfo(d.id, { byId: req.user.id, byName: req.user.name }, r.value.reply, files);

  logEvent({
    type: "request.info_completed", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: d.id, entityLabel: d.offer?.title,
    details: { reply: r.value.reply.slice(0, 200), files: files.length }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "request", title: "العميل أرسل المعلومات المطلوبة",
    body: `العميل ${req.user.name} أرسل المعلومات الإضافية للطلب رقم ${d.seq ?? d.id}`,
    entityType: "request", entityId: d.id, ip: requestIp(req),
  });

  res.json({ ok: true, request: serialize(after) });
}));

/* ============================================================
   التذاكر
============================================================ */
client.get("/tickets", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const status = String(req.query.status || "");
  const valid = TICKET_STATUSES.includes(status);

  const where = valid ? "t.user_id=? AND t.status=?" : "t.user_id=?";
  const args = valid ? [req.user.id, status] : [req.user.id];

  const rows = all(
    `SELECT t.id,t.seq,t.request_id,t.subject,t.message,t.files,t.status,t.assigned_to,
            t.version,t.created_at,t.updated_at,
            r.status request_status, o.title offer_title
     FROM tickets t
     LEFT JOIN requests r ON r.id=t.request_id
     LEFT JOIN offers o ON o.id=r.offer_id
     WHERE ${where}
     ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(`SELECT COUNT(*) c FROM tickets t WHERE ${where}`, ...args).c);

  res.json({
    ok: true,
    tickets: rows.map((t) => ({ ...t, files: filesOf(t.files) })),
    pagination: pagination(page, per, total),
  });
});

client.post("/tickets", uploader.array("files", config.maxFilesPerRequest), asyncH(async (req, res) => {
  const r = parse(ticketSchema, req.body);
  if (r.error) { discardUploads(req); return failure(res, 422, r.error, { fields: r.fields || {} }); }

  if (r.value.request_id) {
    const own = one("SELECT id FROM requests WHERE id=? AND user_id=?", r.value.request_id, req.user.id);
    if (!own) { discardUploads(req); return failure(res, 422, "الطلب المحدد غير صالح أو لا يتبع حسابك"); }
  }

  const { files, error } = takeUploads(req, "attachments");
  if (error) return failure(res, 422, error);

  const id = uid("TKT");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM tickets").c);

  createTicket({
    id, seq, userId: req.user.id, requestId: r.value.request_id || null,
    subject: r.value.subject, message: r.value.message, files, userName: req.user.name,
  });

  logEvent({
    type: "ticket.create", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: id, entityLabel: r.value.subject,
    details: { request_id: r.value.request_id }, ip: requestIp(req),
  });
  notifyAdmins({
    type: "support", title: "تذكرة دعم جديدة",
    body: `تذكرة جديدة من العميل ${req.user.name}: ${r.value.subject}`,
    entityType: "ticket", entityId: id, ip: requestIp(req),
  });

  res.json({ ok: true, ticket: serializeTicket(tDetail(id, req.user)) });
}));

client.get("/tickets/:id", (req, res) => {
  const t = tDetail(req.params.id, req.user);
  if (!t) return failure(res, 404, "التذكرة غير موجودة أو ليس لديك صلاحية للوصول إليها");
  res.json({ ok: true, ticket: serializeTicket(t) });
});

client.post("/tickets/:id/reply", uploader.array("files", config.maxFilesPerRequest), asyncH(async (req, res) => {
  const r = parse(replySchema, req.body);
  if (r.error) { discardUploads(req); return failure(res, 422, r.error, { fields: r.fields || {} }); }

  const t = one("SELECT * FROM tickets WHERE id=?", req.params.id);
  if (!t || t.user_id !== req.user.id) {
    discardUploads(req);
    return failure(res, 404, "التذكرة غير موجودة أو ليس لديك صلاحية للوصول إليها");
  }

  const { files, error } = takeUploads(req, "attachments");
  if (error) return failure(res, 422, error);

  const wasClosed = t.status === "closed";
  const after = addReply(t.id, { byType: "client", byId: req.user.id, byName: req.user.name }, r.value.text, files);

  logEvent({
    type: wasClosed ? "ticket.reopen" : "ticket.reply", actorType: "client",
    actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject,
    details: { files: files.length }, ip: requestIp(req),
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
  if (!t || t.user_id !== req.user.id)
    return failure(res, 404, "التذكرة غير موجودة أو ليس لديك صلاحية للوصول إليها");

  const after = closeTicket(t.id, { byType: "client", byId: req.user.id, byName: req.user.name });

  logEvent({
    type: "ticket.close", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject, ip: requestIp(req),
  });
  notifyAdmins({
    type: "support", title: "أغلق العميل التذكرة",
    body: `العميل ${req.user.name} أغلق التذكرة رقم ${t.seq ?? t.id}: ${t.subject}`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });

  res.json({ ok: true, ticket: serializeTicket(after) });
});

/* يُستخدم في الاختبارات */
export { serialize, serializeTicket, CLIENT_PREFIXES };
