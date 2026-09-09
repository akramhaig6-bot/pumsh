import { Router } from "express";
import fs from "node:fs";
import { run, one, all, now } from "../db.js";
import { uid, pager, jsonParse, hashPassword, revokeAllSessions, escapeLike, byName, arCount } from "../lib/util.js";
import { parse, failure, asyncH, requireAuth, requestIp } from "../lib/http.js";
import { uploader, validateFile, toAttachment, toPublicAttachment } from "../lib/upload.js";
import { offerSchema, adminSchema, resetByAdminSchema, nameS, emailS } from "../lib/validate.js";
import { logEvent } from "../services/events.js";
import { createNotification, notifyAdmins, retryNotification } from "../services/notify.js";
import { detail as reqDetail, transition } from "../services/requests.js";
import { detail as tDetail, addReply, closeTicket } from "../services/tickets.js";
import { cleanHtml } from "../lib/validate.js";

export const admin = Router();
admin.use(requireAuth);
admin.use((req, res, next) => {
  if (req.user.role !== "admin") return failure(res, 404, "الصفحة غير موجودة");
  next();
});
admin.use((req, res, next) => {
  if (req.user.must_change && !req.path.startsWith("/me"))
    return failure(res, 403, "يجب تغيير كلمة المرور المؤقتة قبل المتابعة");
  next();
});

const A = (req) => ({ byType: "admin", byId: req.user.id, byName: req.user.name });

/* =============== لوحة التحكم =============== */
admin.get("/stats", (req, res) => {
  const q = (sql) => Number(one(sql)?.c || 0);
  const clients = all("SELECT status, COUNT(*) c FROM requests GROUP BY status");
  const statusMap = Object.fromEntries(clients.map((c) => [c.status, c.c]));
  res.json({
    ok: true,
    stats: {
      offers: q("SELECT COUNT(*) c FROM offers"),
      offersByStatus: Object.fromEntries(all("SELECT status, COUNT(*) c FROM offers GROUP BY status").map((r) => [r.status, r.c])),
      requests: q("SELECT COUNT(*) c FROM requests"),
      requestsByStatus: statusMap,
      newRequests: statusMap["new"] || 0,
      infoComplete: statusMap["info_complete"] || 0,
      activeRequests: q("SELECT COUNT(*) c FROM requests WHERE status NOT IN ('rejected','cancelled','closed')"),
      clients: q("SELECT COUNT(*) c FROM users WHERE role='client'"),
      clientsActive: q("SELECT COUNT(*) c FROM users WHERE role='client' AND active=1"),
      ticketsOpen: q("SELECT COUNT(*) c FROM tickets WHERE status!='closed'"),
      ticketsNeedReply: q("SELECT COUNT(*) c FROM tickets WHERE status IN ('open','waiting_admin','reopened')"),
      admins: q("SELECT COUNT(*) c FROM users WHERE role='admin'"),
      unread: q("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", req.user.id),
    },
    needsActionRequests: all(
      `SELECT r.id,r.seq,r.status,o.title offer_title,u.name user_name,r.created_at FROM requests r
       LEFT JOIN offers o ON o.id=r.offer_id LEFT JOIN users u ON u.id=r.user_id
       WHERE r.status IN ('new','info_complete') ORDER BY r.created_at ASC LIMIT 10`,
    ),
    needsReplyTickets: all(
      `SELECT t.id,t.seq,t.subject,t.status,t.updated_at,u.name user_name FROM tickets t
       LEFT JOIN users u ON u.id=t.user_id
       WHERE t.status IN ('open','waiting_admin','reopened') ORDER BY t.updated_at ASC LIMIT 10`,
    ),
    recentEvents: all(
      `SELECT id,type,actor_name,entity_label,created_at FROM events ORDER BY created_at DESC LIMIT 10`,
    ),
  });
});

/* =============== إدارة العروض =============== */
admin.get("/offers", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const rows = all(
    `SELECT o.*, (SELECT COUNT(*) FROM requests r WHERE r.offer_id=o.id) req_count
     FROM offers o
     WHERE (?='' OR o.title LIKE ? ESCAPE '\\') AND (?='' OR o.status=?)
     ORDER BY o.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, st, st, per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM offers WHERE (?='' OR title LIKE ? ESCAPE '\\') AND (?='' OR status=?)`,
    q, `%${escapeLike(q)}%`, st, st,
  ).c;
  res.json({ ok: true, offers: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

admin.post("/offers", asyncH(async (req, res) => {
  const r = parse(offerSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  const save = String(req.body.save || "draft");
  const status = save === "publish" ? "published" : "draft";
  if (status === "published") {
    const miss = [];
    if (!r.value.image) miss.push("image");
    if (miss.length) return failure(res, 422, "الصورة الرئيسية مطلوبة للنشر", { fields: { image: "يرجى اختيار الصورة الرئيسية" } });
  }
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
  }
  res.json({ ok: true, offer: one("SELECT * FROM offers WHERE id=?", id) });
}));

admin.put("/offers/:id", (req, res) => {
  const cur = one("SELECT * FROM offers WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "العرض لم يعد موجوداً");
  const base = Number(req.body.baseVersion || 0);
  if (base && base !== cur.version)
    return failure(res, 409, "تم تعديل هذا العرض من مستخدم آخر، يرجى تحديث الصفحة والمحاولة مجدداً", { code: "CONFLICT", current: cur });
  const r = parse(offerSchema, { ...req.body, status: cur.status });
  if (r.error) return failure(res, 422, r.error);
  const next = { ...cur, ...r.value };
  const save = String(req.body.save || "save");
  if (save === "publish") {
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
    if (cur.summary.length < 20 || cur.description_html.length < 10)
      return failure(res, 422, "أكمل البيانات المطلوبة قبل النشر");
  }
  const activeCount = Number(one("SELECT COUNT(*) c FROM requests WHERE offer_id=? AND status NOT IN ('rejected','cancelled','closed')", cur.id)?.c || 0);
  if (to === "unpublished" && activeCount > 0 && !req.body.confirmed)
    return failure(res, 409, `هذا العرض مرتبط بـ ${arCount(activeCount, { one: "طلب جارٍ واحد", two: "طلبين جاريين", few: "طلبات جارية", many: "طلباً جارياً" })}. إلغاء النشر سيخفيه عن العملاء — هل تريد المتابعة؟`, { code: "CONFIRM", activeCount });
  run("UPDATE offers SET status=?, version=version+1, updated_by=?, updated_at=? WHERE id=?", to, req.user.id, now(), cur.id);
  logEvent({
    type: to === "published" ? "offer.publish" : "offer.unpublish",
    actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "offer", entityId: cur.id, entityLabel: cur.title, details: { activeCount }, ip: requestIp(req),
  });
  res.json({ ok: true, offer: one("SELECT * FROM offers WHERE id=?", cur.id) });
});

admin.delete("/offers/:id", (req, res) => {
  const cur = one("SELECT * FROM offers WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "العرض لم يعد موجوداً");
  const linked = one("SELECT COUNT(*) c FROM requests WHERE offer_id=?", cur.id).c;
  if (cur.status !== "draft")
    return failure(res, 409, "لا يمكن حذف العرض إلا إذا كان مسودة — يمكنك إلغاء نشره بدلاً من ذلك");
  if (linked > 0)
    return failure(res, 409, "لا يمكن حذف عرض مرتبط بطلبات، يمكنك إلغاء نشره بدلاً من ذلك");
  run("DELETE FROM offers WHERE id=?", cur.id);
  logEvent({ type: "offer.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "offer", entityId: cur.id, entityLabel: cur.title, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== إدارة الطلبات =============== */
admin.get("/requests", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const offer = String(req.query.offer_id || "");
  const needs = req.query.needs === "1";
  const starts = needs ? "AND r.status IN ('new','info_complete')" : "";
  const rows = all(
    `SELECT r.id,r.seq,r.status,r.created_at,r.updated_at,o.title offer_title,u.name user_name,u.email user_email
     FROM requests r LEFT JOIN offers o ON o.id=r.offer_id LEFT JOIN users u ON u.id=r.user_id
     WHERE (?='' OR r.id LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
       AND (?='' OR r.status=?) AND (?='' OR r.offer_id=?) ${starts}
     ORDER BY r.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, offer, offer, per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM requests r LEFT JOIN users u ON u.id=r.user_id
     WHERE (?='' OR r.id LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\')
       AND (?='' OR r.status=?) AND (?='' OR r.offer_id=?) ${starts}`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, offer, offer,
  ).c;
  res.json({ ok: true, requests: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

admin.get("/requests/offers-select", (req, res) => {
  res.json({ ok: true, offers: all("SELECT id,title,status FROM offers ORDER BY created_at DESC") });
});

admin.get("/requests/:id", (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d) return failure(res, 404, "الطلب لم يعد موجوداً");
  res.json({ ok: true, request: serialize(d) });
});

/** انتقال حالة من الأدمن مع أسباب إلزامية للرفض/الإلغاء */
admin.post("/requests/:id/transition", asyncH(async (req, res) => {
  const d = reqDetail(req.params.id);
  if (!d) return failure(res, 404, "الطلب لم يعد موجوداً");
  const to = String(req.body.to || "");
  const base = Number(req.body.baseVersion || 0);
  if (base && base !== d.version)
    return failure(res, 409, "تغيّر الطلب أثناء عملك عليه، يرجى تحديث الصفحة لعرض الوضع الحالي", { code: "CONFLICT", request: serialize(d) });
  const note = String(req.body.note || "").trim();
  const reason = String(req.body.reason || "").trim();
  if (to === "rejected" && reason.length < 10)
    return failure(res, 422, "سبب الرفض مطلوب ولا يقل عن 10 أحرف");
  if (to === "cancelled" && reason.length < 10)
    return failure(res, 422, "سبب الإلغاء مطلوب ولا يقل عن 10 أحرف");
  if (to === "info_waiting" && note.length < 10)
    return failure(res, 422, "اكتب المعلومات المطلوبة من العميل (10 أحرف على الأقل)");

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
  if (lbl) createNotification({ userId: d.user_id, type: "request", title: lbl.title, body: lbl.body, entityType: "request", entityId: d.id, ip: requestIp(req) });
  logEvent({
    type: "request.transition", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: d.id, entityLabel: d.offer?.title, details: { from: d.status, to, note, reason }, ip: requestIp(req),
  });
  res.json({ ok: true, request: serialize(after) });
}));

/* =============== إدارة العملاء =============== */
admin.get("/users", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const rows = all(
    `SELECT u.id,u.name,u.email,u.phone,u.active,u.created_at,u.last_login_at,
       (SELECT COUNT(*) FROM requests r WHERE r.user_id=u.id) reqs,
       (SELECT COUNT(*) FROM tickets t WHERE t.user_id=u.id) tks
     FROM users u WHERE u.role='client'
       AND (?='' OR u.name LIKE ? ESCAPE '\\' OR u.email LIKE ? ESCAPE '\\' OR u.phone LIKE ? ESCAPE '\\')
       AND (?='' OR u.active=?)
     ORDER BY u.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st === "" ? null : st === "active" ? 1 : 0, per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM users WHERE role='client' AND (?='' OR name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\') AND (?='' OR active=?)`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st === "" ? null : st === "active" ? 1 : 0,
  ).c;
  res.json({ ok: true, users: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
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
  const requests = all("SELECT id,seq,status,offer_id,created_at FROM requests WHERE user_id=? ORDER BY created_at DESC LIMIT 5", u.id);
  const tickets = all("SELECT id,seq,subject,status,updated_at FROM tickets WHERE user_id=? ORDER BY updated_at DESC LIMIT 5", u.id);
  const events = all(
    `SELECT id,type,actor_name,details,created_at FROM events WHERE entity_id=? OR actor_id=? ORDER BY created_at DESC LIMIT 10`,
    u.id, u.id,
  );
  res.json({ ok: true, user: u, requests, tickets, events });
});

admin.post("/users/:id/toggle", (req, res) => {
  const u = one("SELECT * FROM users WHERE id=? AND role='client'", req.params.id);
  if (!u) return failure(res, 404, "العميل غير موجود");
  const active = req.body.active ? 1 : 0;
  run("UPDATE users SET active=?, updated_at=? WHERE id=?", active, now(), u.id);
  if (!active) revokeAllSessions(u.id);
  logEvent({
    type: active ? "user.reactivate" : "user.disable", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req),
  });
  res.json({ ok: true });
});

admin.post("/users/:id/reset", (req, res) => {
  const r = parse(resetByAdminSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const u = one("SELECT * FROM users WHERE id=? AND role='client'", req.params.id);
  if (!u) return failure(res, 404, "العميل غير موجود");
  const { salt, hash } = hashPassword(r.value.temp);
  run("UPDATE users SET pass_hash=?, salt=?, updated_at=? WHERE id=?", hash, salt, now(), u.id);
  revokeAllSessions(u.id);
  logEvent({
    type: "user.password_reset_by_admin", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req),
  });
  res.json({ ok: true });
});

/* =============== تذاكر الأدمن =============== */
admin.get("/tickets", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const st = String(req.query.status || "");
  const needs = req.query.needs === "1";
  const starts = needs ? "AND t.status IN ('open','waiting_admin','reopened')" : "";
  const rows = all(
    `SELECT t.id,t.seq,t.subject,t.status,t.created_at,t.updated_at,t.request_id,u.name user_name
     FROM tickets t LEFT JOIN users u ON u.id=t.user_id
     WHERE (?='' OR t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\')
       AND (?='' OR t.status=?) ${starts}
     ORDER BY t.updated_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM tickets t LEFT JOIN users u ON u.id=t.user_id
     WHERE (?='' OR t.id LIKE ? ESCAPE '\\' OR t.subject LIKE ? ESCAPE '\\' OR u.name LIKE ? ESCAPE '\\') AND (?='' OR t.status=?) ${starts}`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st,
  ).c;
  res.json({ ok: true, tickets: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

admin.get("/tickets/:id", (req, res) => {
  const t = tDetail(req.params.id, { id: req.user.id, role: "admin" });
  if (!t) return failure(res, 404, "التذكرة غير موجودة");
  res.json({ ok: true, ticket: serializeTicket(t) });
});

admin.post("/tickets/:id/reply", uploader.array("files", 6), asyncH(async (req, res) => {
  const text = String(req.body.text || "").trim();
  if (!text) return failure(res, 422, "يرجى كتابة الرد أولاً");
  if (text.length > 5000) return failure(res, 422, "الرد طويل جداً (الحد 5000 حرف)");
  const t = one("SELECT * FROM tickets WHERE id=?", req.params.id);
  if (!t) return failure(res, 404, "التذكرة غير موجودة");
  const files = [];
  for (const f of req.files || []) {
    const err = validateFile(f);
    if (err) return failure(res, 422, err);
    files.push(toAttachment(f));
  }
  const after = addReply(t.id, A(req), text, files);
  logEvent({ type: "ticket.reply", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "ticket", entityId: t.id, entityLabel: t.subject, details: { files: files.length }, ip: requestIp(req) });
  createNotification({
    userId: t.user_id, type: "support", title: "رد جديد من فريق الدعم على تذكرتك",
    body: `أضاف فريق الدعم رداً جديداً على تذكرتك رقم ${t.seq ?? t.id}: ${t.subject}`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });
  res.json({ ok: true, ticket: serializeTicket(after) });
}));

admin.post("/tickets/:id/close", (req, res) => {
  const t = one("SELECT * FROM tickets WHERE id=?", req.params.id);
  if (!t) return failure(res, 404, "التذكرة غير موجودة");
  const after = closeTicket(t.id, A(req));
  logEvent({ type: "ticket.close", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "ticket", entityId: t.id, entityLabel: t.subject, ip: requestIp(req) });
  createNotification({
    userId: t.user_id, type: "support", title: "تم إغلاق تذكرتك",
    body: `تم إغلاق تذكرتك رقم ${t.seq ?? t.id}: ${t.subject}. يمكنك إعادة فتحها في أي وقت بإضافة رد جديد`,
    entityType: "ticket", entityId: t.id, ip: requestIp(req),
  });
  res.json({ ok: true });
});

/* =============== المستخدمون الإداريون =============== */
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

admin.post("/admins", (req, res) => {
  const r = parse(adminSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  if (one("SELECT id FROM users WHERE email=?", r.value.email))
    return failure(res, 409, "هذا البريد مسجل بالفعل");
  const { salt, hash } = hashPassword(r.value.password);
  const id = uid("ADM");
  run(
    `INSERT INTO users (id,name,email,phone,pass_hash,salt,role,active,must_change,created_at,created_by,updated_at)
     VALUES (?,?,?,?,?,?,'admin',1,1,?,?,?)`,
    id, r.value.name, r.value.email, "", hash, salt, now(), req.user.id, now(),
  );
  logEvent({ type: "admin.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "user", entityId: id, entityLabel: r.value.email, ip: requestIp(req) });
  res.json({ ok: true, id, temporary: r.value.password });
});

admin.post("/admins/:id/toggle", (req, res) => {
  const u = one("SELECT * FROM users WHERE id=? AND role='admin'", req.params.id);
  if (!u) return failure(res, 404, "المشرف غير موجود");
  if (u.id === req.user.id) return failure(res, 409, "لا يمكنك تعطيل حسابك الخاص");
  const active = req.body.active ? 1 : 0;
  if (!active) {
    const activeCount = one("SELECT COUNT(*) c FROM users WHERE role='admin' AND active=1").c;
    if (activeCount <= 1) return failure(res, 409, "لا يمكن تعطيل آخر مشرف نشط في النظام");
  }
  run("UPDATE users SET active=?, updated_at=? WHERE id=?", active, now(), u.id);
  if (!active) revokeAllSessions(u.id);
  logEvent({ type: active ? "admin.reactivate" : "admin.disable", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req) });
  res.json({ ok: true });
});

admin.post("/admins/:id/reset", (req, res) => {
  const r = parse(resetByAdminSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const u = one("SELECT * FROM users WHERE id=? AND role='admin'", req.params.id);
  if (!u) return failure(res, 404, "المشرف غير موجود");
  const { salt, hash } = hashPassword(r.value.temp);
  run("UPDATE users SET pass_hash=?, salt=?, must_change=1, updated_at=? WHERE id=?", hash, salt, now(), u.id);
  revokeAllSessions(u.id);
  logEvent({ type: "admin.password_reset", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "user", entityId: u.id, entityLabel: u.email, ip: requestIp(req) });
  res.json({ ok: true });
});

admin.put("/me/profile", (req, res) => {
  const name = String(req.body.name || "").trim();
  const email = String(req.body.email || "").trim().toLowerCase();
  const nameOk = nameS.safeParse(name);
  const emailOk = emailS.safeParse(email);
  if (!nameOk.success) return failure(res, 422, "الاسم لا يقل عن 3 أحرف", { fields: { name: nameOk.error.issues[0].message } });
  if (!emailOk.success) return failure(res, 422, "صيغة البريد غير صحيحة", { fields: { email: emailOk.error.issues[0].message } });
  if (one("SELECT id FROM users WHERE email=? AND id!=?", email, req.user.id))
    return failure(res, 409, "هذا البريد مسجل بالفعل");
  run("UPDATE users SET name=?, email=?, updated_at=? WHERE id=?", name, email, now(), req.user.id);
  logEvent({ type: "admin.profile_updated", actorType: "admin", actorId: req.user.id, actorName: name, entityType: "user", entityId: req.user.id, ip: requestIp(req) });
  res.json({ ok: true, user: { id: req.user.id, name, email } });
});

/* =============== الإشعارات (الأدمن) =============== */
admin.get("/notifications", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 15);
  const scope = req.query.scope === "all" ? "" : "AND user_id=?";
  const q = String(req.query.q || "");
  const status = String(req.query.status || "");
  const rows = all(
    `SELECT * FROM notifications WHERE 1=1 ${scope} ${status ? "AND status=?" : ""}
     AND (?='' OR title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    ...(scope ? [req.user.id] : []), ...(status ? [status] : []),
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM notifications WHERE 1=1 ${scope} ${status ? "AND status=?" : ""} AND (?='' OR title LIKE ? ESCAPE '\\' OR body LIKE ? ESCAPE '\\')`,
    ...(scope ? [req.user.id] : []), ...(status ? [status] : []), q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`,
  ).c;
  res.json({ ok: true, notifications: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

admin.post("/notifications/:id/retry", (req, res) => {
  const out = retryNotification(req.params.id, req.user);
  if (out.error) return failure(res, 400, out.error);
  res.json({ ok: true });
});

/* =============== سجل الأحداث =============== */
admin.get("/events", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 15);
  const q = String(req.query.q || "");
  const type = String(req.query.type || "");
  const entity = String(req.query.entity || "");
  const from = String(req.query.from || "");
  const to = String(req.query.to || "");
  const rows = all(
    `SELECT * FROM events WHERE 1=1
     AND (?='' OR actor_name LIKE ? ESCAPE '\\' OR entity_label LIKE ? ESCAPE '\\') 
     AND (?='' OR type=?) AND (?='' OR entity_type=?)
     AND (?='' OR created_at>=?) AND (?='' OR created_at<=?)
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, type, type, entity, entity,
    from, from ? from + "T00:00:00.000Z" : "", to, to ? to + "T23:59:59.999Z" : "", per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM events WHERE 1=1
     AND (?='' OR actor_name LIKE ? ESCAPE '\\' OR entity_label LIKE ? ESCAPE '\\') 
     AND (?='' OR type=?) AND (?='' OR entity_type=?)
     AND (?='' OR created_at>=?) AND (?='' OR created_at<=?)`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, type, type, entity, entity,
    from, from ? from + "T00:00:00.000Z" : "", to, to ? to + "T23:59:59.999Z" : "",
  ).c;
  res.json({ ok: true, events: rows.map((e) => ({ ...e, details: jsonParse(e.details, {}) })), pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

admin.get("/events/export.csv", (req, res) => {
  const rows = all("SELECT type,actor_name,entity_type,entity_label,details,ip,created_at FROM events ORDER BY created_at DESC LIMIT 5000");
  const esc = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = ["type,actor,entity_type,entity_label,details,ip,created_at", ...rows.map((r) => [r.type, r.actor_name, r.entity_type, r.entity_label, (jsonParse(r.details, {}) || {}).from ? `${jsonParse(r.details).from}->${jsonParse(r.details).to}` : jsonParse(r.details) ? JSON.stringify(jsonParse(r.details)) : "", r.ip, r.created_at].map(esc).join(","))];
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=events.csv");
  res.send("\ufeff" + lines.join("\n"));
});

admin.get("/events/:id", (req, res) => {
  const e = one("SELECT * FROM events WHERE id=?", req.params.id);
  if (!e) return failure(res, 404, "الحدث غير موجود");
  res.json({ ok: true, event: { ...e, details: jsonParse(e.details, {}) } });
});

/* =============== مساعدات =============== */
function serialize(d) {
  return {
    ...d,
    files: (jsonParse(d.files, []) || []).map(toPublicAttachment),
    info: (d.info || []).map((i) => ({ ...i, files: (jsonParse(i.files, []) || []).map(toPublicAttachment) })),
  };
}
function serializeTicket(t) {
  return {
    ...t,
    files: (jsonParse(t.files, []) || []).map(toPublicAttachment),
    replies: (t.replies || []).map((r) => ({ ...r, files: (jsonParse(r.files, []) || []).map(toPublicAttachment) })),
  };
}
