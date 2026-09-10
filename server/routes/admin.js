import { Router } from "express";
import { run, one, all, now } from "../db.js";
import {
  uid, pager, pagination, jsonParse, hashPassword, revokeAllSessions,
  escapeLike, arCount, publicUser,
} from "../lib/util.js";
import {
  parse, failure, asyncH, requireAuth, requireAdmin, requirePasswordChanged, requestIp,
} from "../lib/http.js";
import {
  uploader, consumeUploads, discardUploads, uploadCleanup, toPublicAttachment,
} from "../lib/upload.js";
import {
  offerSchema, adminSchema, resetByAdminSchema, nameS, emailS, cleanHtml, replySchema,
} from "../lib/validate.js";
import { logEvent } from "../services/events.js";
import { createNotification, retryNotification } from "../services/notify.js";
import {
  detail as reqDetail, transition, assignRequest, REQUEST_STATUSES,
} from "../services/requests.js";
import { detail as tDetail, addReply, closeTicket, assignTicket, TICKET_STATUSES } from "../services/tickets.js";
import { emitToAll, statsDirty, EV } from "../services/realtime.js";
import { config } from "../config.js";

export const admin = Router();

/* [C3] بوابة الأدمن + بوابة كلمة المرور المؤقتة — معاً، على كل المسارات */
admin.use(requireAuth);
admin.use(requireAdmin);
admin.use(requirePasswordChanged);
admin.use(uploadCleanup);

const A = (req) => ({ byType: "admin", byId: req.user.id, byName: req.user.name });

function filesOf(raw) {
  return (jsonParse(raw, []) || []).map(toPublicAttachment);
}
function serialize(d) {
  if (!d) return null;
  return { ...d, files: filesOf(d.files), info: (d.info || []).map((i) => ({ ...i, files: filesOf(i.files) })) };
}
function serializeTicket(t) {
  if (!t) return null;
  return { ...t, files: filesOf(t.files), replies: (t.replies || []).map((r) => ({ ...r, files: filesOf(r.files) })) };
}
function takeUploads(req) {
  const { files, error } = consumeUploads(req, "attachments", { imagesOnly: false });
  return { files: error ? null : files.map((f) => ({ path: f.path, name: f.name, mime: f.mime, size: f.size })), error };
}

/** يبني استجابة عرض عامة للواجهة */
function offerPayload(row) {
  const { created_by, updated_by, ...rest } = row || {};
  return rest;
}

/* ============================================================
   لوحة التحكم — [RT-5] تُبث عند كل تغيّر ذي أثر
============================================================ */
admin.get("/stats", (req, res) => {
  const q = (sql, ...args) => Number(one(sql, ...args)?.c || 0);
  const byStatus = all("SELECT status, COUNT(*) c FROM requests GROUP BY status");
  const statusMap = Object.fromEntries(byStatus.map((c) => [c.status, c.c]));

  res.json({
    ok: true,
    stats: {
      offers: q("SELECT COUNT(*) c FROM offers"),
      offersByStatus: Object.fromEntries(all("SELECT status, COUNT(*) c FROM offers GROUP BY status").map((r) => [r.status, r.c])),
      requests: q("SELECT COUNT(*) c FROM requests"),
      requestsByStatus: statusMap,
      newRequests: statusMap.new || 0,
      infoComplete: statusMap.info_complete || 0,
      activeRequests: q("SELECT COUNT(*) c FROM requests WHERE status NOT IN ('rejected','cancelled','closed')"),
      clients: q("SELECT COUNT(*) c FROM users WHERE role='client'"),
      clientsActive: q("SELECT COUNT(*) c FROM users WHERE role='client' AND active=1"),
      tickets: q("SELECT COUNT(*) c FROM tickets"),
      ticketsOpen: q("SELECT COUNT(*) c FROM tickets WHERE status!='closed'"),
      ticketsNeedReply: q("SELECT COUNT(*) c FROM tickets WHERE status IN ('open','waiting_admin','reopened')"),
      admins: q("SELECT COUNT(*) c FROM users WHERE role='admin'"),
      unread: q("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", req.user.id),
    },
    needsActionRequests: all(
      `SELECT r.id,r.seq,r.status,r.created_at,o.title offer_title,u.name user_name
       FROM requests r
       LEFT JOIN offers o ON o.id=r.offer_id
       LEFT JOIN users u ON u.id=r.user_id
       WHERE r.status IN ('new','info_complete') ORDER BY r.created_at ASC LIMIT 10`,
    ),
    needsReplyTickets: all(
      `SELECT t.id,t.seq,t.subject,t.status,t.updated_at,u.name user_name
       FROM tickets t LEFT JOIN users u ON u.id=t.user_id
       WHERE t.status IN ('open','waiting_admin','reopened') ORDER BY t.updated_at ASC LIMIT 10`,
    ),
    recentEvents: all("SELECT id,type,actor_name,entity_label,created_at FROM events ORDER BY created_at DESC LIMIT 10"),
  });
});

/* ============================================================
   إدارة العروض — [RT-1] كل تغيّر يُبثّ
============================================================ */
admin.get("/offers", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const rows = all(
    `SELECT o.id,o.title,o.summary,o.image,o.start_date,o.end_date,o.status,o.version,
            o.created_at,o.updated_at,o.created_by,o.updated_by,
            (SELECT COUNT(*) FROM requests r WHERE r.offer_id=o.id) req_count
     FROM offers o
     WHERE (?='' OR o.title LIKE ? ESCAPE '\\') AND (?='' OR o.status=?)
     ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, st, st, per, (page - 1) * per,
  );
  const total = Number(one(
    "SELECT COUNT(*) c FROM offers WHERE (?='' OR title LIKE ? ESCAPE '\\') AND (?='' OR status=?)",
    q, `%${escapeLike(q)}%`, st, st,
  ).c);
  res.json({ ok: true, offers: rows, pagination: pagination(page, per, total) });
});

admin.get("/offers/:id", (req, res) => {
  const o = one("SELECT * FROM offers WHERE id=?", req.params.id);
  if (!o) return failure(res, 404, "العرض لم يعد موجوداً");
  res.json({ ok: true, offer: o });
});

admin.post("/offers", asyncH(async (req, res) => {
  const r = parse(offerSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });

  const save = String(req.body.save || "draft");
  const status = save === "publish" ? "published" : "draft";
  if (status === "published" && !r.value.image)
    return failure(res, 422, "الصورة الرئيسية مطلوبة للنشر", { fields: { image: "يرجى اختيار الصورة الرئيسية" } });

  const id = uid("OFF");
  run(
    `INSERT INTO offers (id,title,summary,description_html,terms_html,image,start_date,end_date,status,version,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,1,?,?,?)`,
    id, r.value.title, r.value.summary, cleanHtml(r.value.description_html), cleanHtml(r.value.terms_html),
    r.value.image, r.value.start_date || null, r.value.end_date || null, status, req.user.id, now(), now(),
  );

  logEvent({
    type: "offer.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "offer", entityId: id, entityLabel: r.value.title, details: { status }, ip: requestIp(req),
  });
  if (status === "published") {
    logEvent({ type: "offer.publish", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "offer", entityId: id, entityLabel: r.value.title, ip: requestIp(req) });
    emitToAll(EV.OFFER_PUBLISHED, { id, title: r.value.title, summary: r.value.summary, image: r.value.image });
  } else {
    emitToAll(EV.OFFER_CREATED, { id, title: r.value.title });
  }
  statsDirty("offer");

  res.json({ ok: true, offer: one("SELECT * FROM offers WHERE id=?", id) });
}));

admin.put("/offers/:id", (req, res) => {
  const cur = one("SELECT * FROM offers WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "العرض لم يعد موجوداً");

  const base = Number(req.body.baseVersion || 0);
  if (base && base !== cur.version)
    return failure(res, 409, "تم تعديل هذا العرض من مستخدم آخر، يرجى تحديث الصفحة والمحاولة مجدداً", { code: "CONFLICT", current: cur });

  const r = parse(offerSchema, { ...req.body, status: cur.status });
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });

  const next = { ...cur, ...r.value };
  if (String(req.body.save || "save") === "publish") {
    if (!next.image) return failure(res, 422, "الصورة الرئيسية مطلوبة للنشر");
    next.status = "published";
  }

  run(
    `UPDATE offers SET title=?,summary=?,description_html=?,terms_html=?,image=?,start_date=?,end_date=?,status=?,version=version+1,updated_by=?,updated_at=? WHERE id=?`,
    next.title, next.summary, cleanHtml(next.description_html), cleanHtml(next.terms_html), next.image,
    next.start_date || null, next.end_date || null, next.status, req.user.id, now(), cur.id,
  );

  logEvent({
    type: "offer.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "offer", entityId: cur.id, entityLabel: next.title, details: { changes: Object.keys(r.value) }, ip: requestIp(req),
  });

  const publishedNow = next.status === "published" && cur.status !== "published";
  emitToAll(publishedNow ? EV.OFFER_PUBLISHED : EV.OFFER_UPDATED, {
    id: cur.id, title: next.title, summary: next.summary, image: next.image, status: next.status,
  });
  statsDirty("offer");

  res.json({ ok: true, offer: one("SELECT * FROM offers WHERE id=?", cur.id) });
});

admin.post("/offers/:id/status", (req, res) => {
  const cur = one("SELECT * FROM offers WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "العرض لم يعد موجوداً");

  const to = String(req.body.to || "");
  const allowedMap = { draft: ["published"], published: ["unpublished"], unpublished: ["published"] };
  if (!allowedMap[cur.status]?.includes(to))
    return failure(res, 409, "لا يمكن تغيير حالة العرض بهذه الطريقة");

  if (to === "published") {
    if (!cur.image) return failure(res, 422, "الصورة الرئيسية مطلوبة للنشر");
    if (String(cur.summary || "").length < 20 || String(cur.description_html || "").length < 10)
      return failure(res, 422, "أكمل البيانات المطلوبة قبل النشر");
  }

  const activeCount = Number(one(
    "SELECT COUNT(*) c FROM requests WHERE offer_id=? AND status NOT IN ('rejected','cancelled','closed')", cur.id,
  ).c);
  if (to === "unpublished" && activeCount > 0 && !req.body.confirmed) {
    return failure(
      res, 409,
      `هذا العرض مرتبط بـ ${arCount(activeCount, { one: "طلب جارٍ واحد", two: "طلبين جاريين", few: "طلبات جارية", many: "طلباً جارياً" })}. إلغاء النشر سيخفيه عن العملاء — هل تريد المتابعة؟`,
      { code: "CONFIRM", activeCount },
    );
  }

  run("UPDATE offers SET status=?, version=version+1, updated_by=?, updated_at=? WHERE id=?",
    to, req.user.id, now(), cur.id);

  logEvent({
    type: to === "published" ? "offer.publish" : "offer.unpublish",
    actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "offer", entityId: cur.id, entityLabel: cur.title, details: { activeCount }, ip: requestIp(req),
  });

  emitToAll(to === "published" ? EV.OFFER_PUBLISHED : EV.OFFER_UNPUBLISHED, {
    id: cur.id, title: cur.title, summary: cur.summary, image: cur.image,
  });
  statsDirty("offer");

  res.json({ ok: true, offer: one("SELECT * FROM offers WHERE id=?", cur.id) });
});

admin.delete("/offers/:id", (req, res) => {
  const cur = one("SELECT * FROM offers WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "العرض لم يعد موجوداً");
  if (cur.status !== "draft")
    return failure(res, 409, "لا يمكن حذف العرض إلا إذا كان مسودة — يمكنك إلغاء نشره بدلاً من ذلك");

  const linked = Number(one("SELECT COUNT(*) c FROM requests WHERE offer_id=?", cur.id).c);
  if (linked > 0)
    return failure(res, 409, "لا يمكن حذف عرض مرتبط بطلبات، يمكنك إلغاء نشره بدلاً من ذلك");

  run("DELETE FROM offers WHERE id=?", cur.id);
  logEvent({ type: "offer.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "offer", entityId: cur.id, entityLabel: cur.title, ip: requestIp(req) });
  emitToAll(EV.OFFER_DELETED, { id: cur.id });
  statsDirty("offer");

  res.json({ ok: true });
});

/* ============================================================
   إدارة الطلبات
============================================================ */
admin.get("/requests", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const offer = String(req.query.offer_id || "");
  const needs = req.query.needs === "1";

  const where = [
    "(?='' OR r.id LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')",
    "(?='' OR r.status=?)",
    "(?='' OR r.offer_id=?)",
  ];
  const args = [q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, offer, offer];
  if (needs) where.push("r.status IN ('new','info_complete')");

  const clause = where.join(" AND ");
  const rows = all(
    `SELECT r.id,r.seq,r.status,r.assigned_to,r.created_at,r.updated_at,
            o.title offer_title,u.name user_name,u.email user_email
     FROM requests r
     LEFT JOIN offers o ON o.id=r.offer_id
     LEFT JOIN users u ON u.id=r.user_id
     WHERE ${clause}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(
    `SELECT COUNT(*) c FROM requests r LEFT JOIN users u ON u.id=r.user_id WHERE ${clause}`, ...args,
  ).c);

  res.json({ ok: true, requests: rows, pagination: pagination(page, per, total) });
});

admin.get("/requests/offers-select", (req, res) => {
  res.json({ ok: true, offers: all("SELECT id,title,status FROM offers ORDER BY created_at DESC") });
});

admin.get("/requests/:id", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d) return failure(res, 404, "الطلب لم يعد موجوداً");
  res.json({ ok: true, request: serialize(d) });
});

admin.post("/requests/:id/transition", asyncH(async (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d) return failure(res, 404, "الطلب لم يعد موجوداً");

  const to = String(req.body.to || "");
  if (!REQUEST_STATUSES.includes(to)) return failure(res, 422, "الحالة المطلوبة غير صالحة");

  const base = Number(req.body.baseVersion || 0);
  if (base && base !== d.version)
    return failure(res, 409, "تغيّر الطلب أثناء عملك عليه، يرجى تحديث الصفحة لعرض الوضع الحالي", { code: "CONFLICT", request: serialize(d) });

  const note = String(req.body.note || "").trim();
  const reason = String(req.body.reason || "").trim();
  if (to === "rejected" && reason.length < 10) return failure(res, 422, "سبب الرفض مطلوب ولا يقل عن 10 أحرف");
  if (to === "cancelled" && reason.length < 10) return failure(res, 422, "سبب الإلغاء مطلوب ولا يقل عن 10 أحرف");
  if (to === "info_waiting" && note.length < 10) return failure(res, 422, "اكتب المعلومات المطلوبة من العميل (10 أحرف على الأقل)");

  /* transition يبثّ request:status_changed للعميل وللأدمن [RT-1] */
  const after = transition(d.id, to, A(req), { note, reason });

  const reqNo = d.seq ?? d.id;
  const labels = {
    review: { title: "طلبك قيد المراجعة", body: `بدأ فريقنا مراجعة طلبك رقم ${reqNo} على العرض «${d.offer?.title}»` },
    info_waiting: { title: "طلبك يحتاج معلومات إضافية", body: `نحتاج معلومات إضافية على طلبك رقم ${reqNo}. المطلوب: ${note.slice(0, 100)}` },
    accepted: { title: "تم قبول طلبك", body: `تم قبول طلبك رقم ${reqNo} على العرض «${d.offer?.title}»` },
    rejected: { title: "تم رفض طلبك", body: `تم رفض طلبك رقم ${reqNo}. السبب: ${reason.slice(0, 100)}` },
    cancelled: { title: "تم إلغاء طلبك", body: `تم إلغاء طلبك رقم ${reqNo}. السبب: ${reason.slice(0, 100)}` },
    completed: { title: "تم إكمال طلبك", body: `تم إكمال معالجة طلبك رقم ${reqNo}${note ? `. ${note}` : ""}` },
    closed: { title: "تم إغلاق طلبك", body: `تم إغلاق طلبك رقم ${reqNo}. شكراً لثقتك بنا` },
  };
  const lbl = labels[to];
  if (lbl) {
    createNotification({
      userId: d.user_id, type: "request", title: lbl.title, body: lbl.body,
      entityType: "request", entityId: d.id, ip: requestIp(req),
    });
  }

  logEvent({
    type: "request.transition", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: d.id, entityLabel: d.offer?.title,
    details: { from: d.status, to, note: note.slice(0, 300), reason: reason.slice(0, 300) }, ip: requestIp(req),
  });

  res.json({ ok: true, request: serialize(after) });
}));

admin.post("/requests/:id/assign", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d) return failure(res, 404, "الطلب لم يعد موجوداً");
  const after = assignRequest(d.id, req.user.id, req.user.name);
  logEvent({
    type: "request.assign", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: d.id, entityLabel: d.offer?.title, ip: requestIp(req),
  });
  res.json({ ok: true, request: serialize(after) });
});

/* ============================================================
   إدارة العملاء
============================================================ */
admin.get("/users", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const activeArg = st === "" ? null : st === "active" ? 1 : 0;

  const rows = all(
    `SELECT u.id,u.name,u.email,u.phone,u.active,u.created_at,u.last_login_at,
       (SELECT COUNT(*) FROM requests r WHERE r.user_id=u.id) reqs,
       (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id) tks
     FROM users u WHERE u.role='client'
       AND (?='' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')
       AND (? IS NULL OR u.active=?)
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, activeArg, activeArg, per, (page - 1) * per,
  );
  const total = Number(one(
    `SELECT COUNT(*) c FROM users WHERE role='client'
       AND (?='' OR name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\')
       AND (? IS NULL OR active=?)`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, activeArg, activeArg,
  ).c);

  res.json({ ok: true, users: rows, pagination: pagination(page, per, total) });
});

admin.get("/users/:id", (req, res) => {
  const u = one(
    `SELECT u.id,u.name,u.email,u.phone,u.active,u.must_change,u.created_at,u.last_login_at,u.updated_at,
       (SELECT COUNT(*) FROM requests r WHERE r.user_id=u.id) reqs,
       (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id) tks
     FROM users u WHERE u.id=? AND u.role='client'`,
    req.params.id,
  );
  if (!u) return failure(res, 404, "العميل غير موجود");

  const requests = all(
    "SELECT r.id,r.seq,r.status,r.created_at,o.title offer_title FROM requests r LEFT JOIN offers o ON o.id=r.offer_id WHERE r.user_id=? ORDER BY r.created_at DESC LIMIT 5",
    u.id,
  );
  const tickets = all("SELECT id,seq,subject,status,updated_at FROM tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 5", u.id);
  const events = all(
    "SELECT id,type,actor_name,details,created_at FROM events WHERE entity_id=? OR actor_id=? ORDER BY created_at DESC LIMIT 10",
    u.id, u.id,
  );
  res.json({ ok: true, user: u, requests, tickets, events: events.map((e) => ({ ...e, details: jsonParse(e.details, {}) })) });
});

admin.post("/users/:id/toggle", (req, res) => {
  const u = one("SELECT id,email FROM users WHERE id=? AND role='client'", req.params.id);
  if (!u) return failure(res, 404, "العميل غير موجود");

  const active = req.body.active ? 1 : 0;
  run("UPDATE users SET active=?, updated_at=? WHERE id=?", active, now(), u.id);
  if (!active) revokeAllSessions(u.id);

  logEvent({
    type: active ? "user.reactivate" : "user.disable", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req),
  });
  statsDirty("user");
  res.json({ ok: true });
});

admin.post("/users/:id/reset", asyncH(async (req, res) => {
  const r = parse(resetByAdminSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });

  const u = one("SELECT id,email FROM users WHERE id=? AND role='client'", req.params.id);
  if (!u) return failure(res, 404, "العميل غير موجود");

  /* [M17] hashPassword غير متزامنة الآن — تُنتظر وتُفكَّك */
  const { salt, hash, encoded } = await hashPassword(r.value.temp);
  run("UPDATE users SET pass_hash=?, salt=?, must_change=1, updated_at=? WHERE id=?",
    encoded || hash, salt, now(), u.id);
  revokeAllSessions(u.id);

  logEvent({
    type: "user.password_reset_by_admin", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req),
  });
  res.json({ ok: true });
}));

/* ============================================================
   تذاكر الأدمن
============================================================ */
admin.get("/tickets", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const needs = req.query.needs === "1";

  const where = [
    "(?='' OR t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')",
    "(?='' OR t.status=?)",
  ];
  const args = [q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st];
  if (needs) where.push("t.status IN ('open','waiting_admin','reopened')");

  const clause = where.join(" AND ");
  const rows = all(
    `SELECT t.id,t.seq,t.subject,t.status,t.assigned_to,t.created_at,t.updated_at,t.request_id,u.name user_name
     FROM tickets t LEFT JOIN users u ON u.id=t.user_id
     WHERE ${clause}
     ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(
    `SELECT COUNT(*) c FROM tickets t LEFT JOIN users u ON u.id=t.user_id WHERE ${clause}`, ...args,
  ).c);

  res.json({ ok: true, tickets: rows, pagination: pagination(page, per, total) });
});

admin.get("/tickets/:id", (req, res) => {
  const t = tDetail(req.params.id, { id: req.user.id, role: "admin" });
  if (!t) return failure(res, 404, "التذكرة غير موجودة");
  res.json({ ok: true, ticket: serializeTicket(t) });
});

admin.post("/tickets/:id/reply", uploader.array("files", config.maxFilesPerRequest), asyncH(async (req, res) => {
  const r = parse(replySchema, req.body);
  if (r.error) { discardUploads(req); return failure(res, 422, r.error, { fields: r.fields || {} }); }

  const t = one("SELECT id,user_id,subject,seq,status FROM tickets WHERE id=?", req.params.id);
  if (!t) { discardUploads(req); return failure(res, 404, "التذكرة غير موجودة"); }

  const { files, error } = takeUploads(req);
  if (error) return failure(res, 422, error);

  /* addReply يبثّ ticket:reply_added + ticket:status_changed [RT-1] */
  const after = addReply(t.id, A(req), r.value.text, files);

  logEvent({
    type: "ticket.reply", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject, details: { files: files.length }, ip: requestIp(req),
  });
  createNotification({
    userId: t.user_id, type: "support", title: "رد جديد من فريق الدعم على تذكرتك",
    body: `أضاف فريق الدعم رداً جديداً على تذكرتك رقم ${t.seq ?? t.id}: ${t.subject}`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });

  res.json({ ok: true, ticket: serializeTicket(after) });
}));

admin.post("/tickets/:id/close", (req, res) => {
  const t = one("SELECT id,user_id,subject,seq,status FROM tickets WHERE id=?", req.params.id);
  if (!t) return failure(res, 404, "التذكرة غير موجودة");

  closeTicket(t.id, A(req));

  logEvent({
    type: "ticket.close", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject, ip: requestIp(req),
  });
  createNotification({
    userId: t.user_id, type: "support", title: "تم إغلاق تذكرتك",
    body: `تم إغلاق تذكرتك رقم ${t.seq ?? t.id}: ${t.subject}. يمكنك إعادة فتحها في أي وقت بإضافة رد جديد`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });

  res.json({ ok: true });
});

admin.post("/tickets/:id/assign", (req, res) => {
  const t = one("SELECT id,subject FROM tickets WHERE id=?", req.params.id);
  if (!t) return failure(res, 404, "التذكرة غير موجودة");
  assignTicket(t.id, req.user.id);
  logEvent({
    type: "ticket.assign", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "ticket", entityId: t.id, entityLabel: t.subject, ip: requestIp(req),
  });
  res.json({ ok: true });
});

/* ============================================================
   المستخدمون الإداريون
============================================================ */
admin.get("/admins", (req, res) => {
  res.json({
    ok: true,
    admins: all(
      `SELECT u.id,u.name,u.email,u.active,u.must_change,u.created_at,u.last_login_at,
         (SELECT COUNT(*) FROM events e WHERE e.actor_id=u.id) actions
       FROM users u WHERE u.role='admin' ORDER BY u.created_at ASC`,
    ),
  });
});

admin.post("/admins", asyncH(async (req, res) => {
  const r = parse(adminSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });
  if (one("SELECT id FROM users WHERE email=?", r.value.email))
    return failure(res, 409, "هذا البريد مسجل بالفعل");

  const { salt, hash, encoded } = await hashPassword(r.value.password);
  const id = uid("ADM");
  run(
    `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,must_change,created_at,created_by,updated_at)
     VALUES (?,?,?,?,?,?,'admin',1,1,?,?,?)`,
    id, r.value.name, r.value.email, "", encoded || hash, salt, now(), req.user.id, now(),
  );

  logEvent({
    type: "admin.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: id, entityLabel: r.value.email, ip: requestIp(req),
  });
  statsDirty("admin");

  /*
   * [X4] كان يعيد `temporary: r.value.password` في الاستجابة — فتُسجَّل كلمة
   * المرور في سجلّات الوكيل وسجلّ المتصفح وأي وسيط HTTPS.
   * الآن: كلمة المرور المؤقتة تُعرض مرة واحدة في الواجهة التي أدخلها المشرف،
   * ولا تعبر الشبكة إطلاقاً.
   */
  res.json({ ok: true, id, mustChangePassword: true });
}));

admin.post("/admins/:id/toggle", (req, res) => {
  const u = one("SELECT id,email FROM users WHERE id=? AND role='admin'", req.params.id);
  if (!u) return failure(res, 404, "المشرف غير موجود");
  if (u.id === req.user.id) return failure(res, 409, "لا يمكنك تعطيل حسابك الخاص");

  const active = req.body.active ? 1 : 0;
  if (!active) {
    const activeCount = Number(one("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1").c);
    if (activeCount <= 1) return failure(res, 409, "لا يمكن تعطيل آخر مشرف نشط في النظام");
  }

  run("UPDATE users SET active=?, updated_at=? WHERE id=?", active, now(), u.id);
  if (!active) revokeAllSessions(u.id);

  logEvent({
    type: active ? "admin.reactivate" : "admin.disable", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req),
  });
  statsDirty("admin");
  res.json({ ok: true });
});

admin.post("/admins/:id/reset", asyncH(async (req, res) => {
  const r = parse(resetByAdminSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });

  const u = one("SELECT id,email FROM users WHERE id=? AND role='admin'", req.params.id);
  if (!u) return failure(res, 404, "المشرف غير موجود");

  const { salt, hash, encoded } = await hashPassword(r.value.temp);
  run("UPDATE users SET pass_hash=?, salt=?, must_change=1, updated_at=? WHERE id=?",
    encoded || hash, salt, now(), u.id);
  revokeAllSessions(u.id);

  logEvent({
    type: "admin.password_reset", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req),
  });
  res.json({ ok: true });
}));

admin.put("/me/profile", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();

  const nameOk = nameS.safeParse(name);
  const emailOk = emailS.safeParse(email);
  if (!nameOk.success) return failure(res, 422, "الاسم غير صالح", { fields: { name: nameOk.error.issues[0].message } });
  if (!emailOk.success) return failure(res, 422, "صيغة البريد غير صحيحة", { fields: { email: emailOk.error.issues[0].message } });
  if (one("SELECT id FROM users WHERE email=? AND id!=?", email, req.user.id))
    return failure(res, 409, "هذا البريد مسجل بالفعل");

  run("UPDATE users SET name=?, email=?, updated_at=? WHERE id=?", name, email, now(), req.user.id);
  logEvent({
    type: "admin.profile_updated", actorType: "admin", actorId: req.user.id, actorName: name,
    entityType: "user", entityId: req.user.id, ip: requestIp(req),
  });

  const fresh = one("SELECT * FROM users WHERE id=?", req.user.id);
  res.json({ ok: true, user: publicUser(fresh) });
});

/* ============================================================
   الإشعارات (الأدمن)
============================================================ */
admin.get("/notifications", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 15);
  const scopeAll = req.query.scope === "all";
  const q = String(req.query.q || "");
  const status = String(req.query.status || "");

  const where = [
    scopeAll ? "1=1" : "user_id=?",
    "(?='' OR status=?)",
    "(?='' OR title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')",
  ];
  const args = [];
  if (!scopeAll) args.push(req.user.id);
  args.push(status, status, q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`);

  const clause = where.join(" AND ");
  const rows = all(
    `SELECT id,user_id,type,title,body,entity_type,entity_id,status,read,created_at
     FROM notifications WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(`SELECT COUNT(*) c FROM notifications WHERE ${clause}`, ...args).c);

  res.json({ ok: true, notifications: rows, pagination: pagination(page, per, total) });
});

admin.post("/notifications/:id/retry", (req, res) => {
  const out = retryNotification(req.params.id, req.user);
  if (out.error) return failure(res, 400, out.error);
  res.json({ ok: true });
});

/* ============================================================
   سجل الأحداث
============================================================ */
function eventFilters(req) {
  const q = String(req.query.q || "");
  const type = String(req.query.type || "");
  const entity = String(req.query.entity || "");
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  return {
    clause: `(?='' OR actor_name LIKE ? ESCAPE '\\' OR entity_label LIKE ? ESCAPE '\\')
             AND (?='' OR type=?) AND (?='' OR entity_type=?)
             AND (?='' OR created_at>=?) AND (?='' OR created_at<=?)`,
    args: [
      q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`,
      type, type, entity, entity,
      from, from ? `${from}T00:00:00.000Z` : "",
      to, to ? `${to}T23:59:59.999Z` : "",
    ],
  };
}

admin.get("/events", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 15);
  const { clause, args } = eventFilters(req);

  const rows = all(
    `SELECT id,type,actor_type,actor_name,entity_type,entity_id,entity_label,details,ip,created_at
     FROM events WHERE ${clause} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...args, per, (page - 1) * per,
  );
  const total = Number(one(`SELECT COUNT(*) c FROM events WHERE ${clause}`, ...args).c);

  res.json({
    ok: true,
    events: rows.map((e) => ({ ...e, details: jsonParse(e.details, {}) })),
    pagination: pagination(page, per, total),
  });
});

admin.get("/events/export.csv", (req, res) => {
  const rows = all(
    "SELECT type,actor_name,entity_type,entity_label,details,ip,created_at FROM events ORDER BY created_at DESC LIMIT 5000",
  );
  /* [X2] حماية من حقن CSV في Excel/Sheets */
  const esc = (v) => {
    const s = String(v ?? "");
    return `"${(s.startsWith("=") || s.startsWith("+") || s.startsWith("-") || s.startsWith("@") ? "'" : "") + s.replace(/"/g, '""')}"`;
  };

  const lines = ["type,actor,entity_type,entity_label,details,ip,created_at"];
  for (const r of rows) {
    const d = jsonParse(r.details, {}) || {};
    const detail = d.from ? `${d.from}->${d.to}` : JSON.stringify(d);
    lines.push([r.type, r.actor_name, r.entity_type, r.entity_label, detail, r.ip, r.created_at].map(esc).join(","));
  }

  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=events.csv");
  res.setHeader("Cache-Control", "no-store");
  res.send("\ufeff" + lines.join("\n"));
});

admin.get("/events/:id", (req, res) => {
  const e = one(
    "SELECT id,type,actor_type,actor_name,entity_type,entity_id,entity_label,details,ip,created_at FROM events WHERE id=?",
    req.params.id,
  );
  if (!e) return failure(res, 404, "الحدث غير موجود");
  res.json({ ok: true, event: { ...e, details: jsonParse(e.details, {}) } });
});

/* يُستخدم في الاختبارات */
export { serialize, serializeTicket, offerPayload, REQUEST_STATUSES, TICKET_STATUSES };
