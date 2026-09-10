import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { run, one, all, now } from "../db.js";
import { uid, pager, pagination, escapeLike, jsonParse, arCount } from "../lib/util.js";
import {
  parse, failure, asyncH, requireAuth, requireAdmin, requirePasswordChanged, requestIp,
} from "../lib/http.js";
import { cleanHtml, articleSchema, pageSchema, categorySchema } from "../lib/validate.js";
import {
  toPublicAttachment, uploader, uploadCleanup, consumeUploads, safeUnlink, sanitizeName,
} from "../lib/upload.js";
import { logEvent } from "../services/events.js";
import { saveSettings, getAllSettings, getSettings, publicMeta, broadcastTexts } from "../services/settings.js";
import { registerMediaFiles, unregisterAttachments } from "../services/attachments.js";
import { emitToAll, EV } from "../services/realtime.js";
import { config, mediaDir } from "../config.js";
import logger from "../lib/logger.js";

export const cms = Router();

/* ============================================================
   [C1] لا استثناءات من فحص الأدمن — إطلاقاً.

   كان الشرط:
       if (req.user.role !== "admin" && !req.path.startsWith("/media"))
   وهذا كان يُخرج كل مسارات /media من الفحص، فأي عميل مسجّل يستطيع
   قراءة مكتبة الوسائط والرفع إليها وحذف الملفات منها.
   (تحقق فعلي قبل الإصلاح: GET/POST /api/cms/media* → HTTP 200 لعميل عادي.)

   [M3] وبوابة كلمة المرور المؤقتة تُطبَّق هنا أيضاً، لا على /api/admin فقط.
============================================================ */
cms.use(requireAuth);
cms.use(requireAdmin);
cms.use(requirePasswordChanged);
cms.use(uploadCleanup);

/* ============================================================
   المقالات
============================================================ */
cms.get("/articles", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const cat = String(req.query.category || "");
  const st = String(req.query.status || "");
  const rows = all(
    `SELECT a.id,a.title,a.slug,a.excerpt,a.status,a.image,a.category_id,a.version,a.created_at,a.updated_at,c.name category_name
     FROM articles a LEFT JOIN categories c ON c.id=a.category_id
     WHERE (?='' OR a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\')
       AND (?='' OR a.status=?) AND (?='' OR a.category_id=?)
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, cat, cat, per, (page - 1) * per,
  );
  const total = Number(one(
    `SELECT COUNT(*) c FROM articles a
     WHERE (?='' OR a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\')
       AND (?='' OR a.status=?) AND (?='' OR a.category_id=?)`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, cat, cat,
  ).c);
  res.json({ ok: true, articles: rows, pagination: pagination(page, per, total) });
});

cms.post("/articles", asyncH(async (req, res) => {
  const r = parse(articleSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  const save = String(req.body.save || "draft");
  const status = save === "publish" ? "published" : "draft";
  if (status === "published" && !r.value.image)
    return failure(res, 422, "الصورة البارزة مطلوبة للنشر", { fields: { image: "يرجى اختيار الصورة البارزة" } });

  const id = uid("ART");
  run(
    `INSERT INTO articles (id,title,slug,excerpt,content_html,image,category_id,status,version,created_by,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,1,?,?,?)`,
    id, r.value.title, r.value.slug || slugOf(r.value.title), r.value.excerpt,
    cleanHtml(r.value.content_html), r.value.image, r.value.category_id || null, status, req.user.id, now(), now(),
  );
  logEvent({
    type: "article.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "article", entityId: id, entityLabel: r.value.title, details: { status }, ip: requestIp(req),
  });

  const article = one("SELECT * FROM articles WHERE id=?", id);
  /* [RT-1] بث فوري */
  emitToAll(status === "published" ? EV.ARTICLE_PUBLISHED : EV.ARTICLE_CREATED, {
    id, title: article.title, slug: article.slug, excerpt: article.excerpt,
    image: article.image, status, created_at: article.created_at,
  });
  res.json({ ok: true, article });
}));

cms.put("/articles/:id", (req, res) => {
  const cur = one("SELECT * FROM articles WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "المقال غير موجود");
  if (Number(req.body.baseVersion || 0) && Number(req.body.baseVersion) !== cur.version)
    return failure(res, 409, "تم تعديل هذا المقال من مستخدم آخر، يرجى تحديث الصفحة والمحاولة مجدداً", { code: "CONFLICT" });

  const r = parse(articleSchema, { ...req.body, status: cur.status });
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  const next = { ...cur, ...r.value };
  let status = cur.status;
  if (req.body.save === "publish") {
    if (!next.image) return failure(res, 422, "الصورة البارزة مطلوبة للنشر");
    status = "published";
  }

  run(
    `UPDATE articles SET title=?,slug=?,excerpt=?,content_html=?,image=?,category_id=?,status=?,version=version+1,updated_by=?,updated_at=? WHERE id=?`,
    next.title, next.slug || slugOf(next.title), next.excerpt, cleanHtml(next.content_html), next.image,
    next.category_id || null, status, req.user.id, now(), cur.id,
  );
  logEvent({
    type: "article.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "article", entityId: cur.id, entityLabel: next.title, details: { changes: Object.keys(r.value) }, ip: requestIp(req),
  });

  const article = one("SELECT * FROM articles WHERE id=?", cur.id);
  emitToAll(status === "published" && cur.status !== "published" ? EV.ARTICLE_PUBLISHED : EV.ARTICLE_UPDATED, {
    id: article.id, title: article.title, slug: article.slug, excerpt: article.excerpt,
    image: article.image, status: article.status, updated_at: article.updated_at,
  });
  res.json({ ok: true, article });
});

cms.delete("/articles/:id", (req, res) => {
  const cur = one("SELECT * FROM articles WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "المقال غير موجود");
  run("DELETE FROM articles WHERE id=?", cur.id);
  logEvent({ type: "article.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "article", entityId: cur.id, entityLabel: cur.title, ip: requestIp(req) });
  emitToAll(EV.ARTICLE_DELETED, { id: cur.id });
  res.json({ ok: true });
});

/* ============================================================
   الصفحات
============================================================ */
cms.get("/pages", (req, res) => {
  res.json({ ok: true, pages: all("SELECT * FROM pages ORDER BY created_at DESC") });
});

cms.post("/pages", asyncH(async (req, res) => {
  const r = parse(pageSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  if (one("SELECT id FROM pages WHERE slug=?", r.value.slug))
    return failure(res, 409, "الرابط المختصر مستخدم من قبل صفحة أخرى");

  const id = uid("PGE");
  const status = req.body.save === "publish" ? "published" : "draft";
  run(
    "INSERT INTO pages (id,title,slug,content_html,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    id, r.value.title, r.value.slug, cleanHtml(r.value.content_html), status, req.user.id, now(), now(),
  );
  logEvent({ type: "page.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "page", entityId: id, entityLabel: r.value.title, ip: requestIp(req) });
  emitToAll(EV.PAGE_UPDATED, { id, slug: r.value.slug, title: r.value.title, status });
  res.json({ ok: true, page: one("SELECT * FROM pages WHERE id=?", id) });
}));

cms.put("/pages/:id", (req, res) => {
  const cur = one("SELECT * FROM pages WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "الصفحة غير موجودة");
  const r = parse(pageSchema, { ...req.body, status: cur.status });
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  if (one("SELECT id FROM pages WHERE slug=? AND id!=?", r.value.slug, cur.id))
    return failure(res, 409, "الرابط المختصر مستخدم من قبل صفحة أخرى");

  const status = req.body.save === "publish" ? "published" : cur.status;
  run(
    "UPDATE pages SET title=?,slug=?,content_html=?,status=?,updated_by=?,updated_at=? WHERE id=?",
    r.value.title, r.value.slug, cleanHtml(r.value.content_html), status, req.user.id, now(), cur.id,
  );
  logEvent({ type: "page.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "page", entityId: cur.id, entityLabel: r.value.title, ip: requestIp(req) });
  emitToAll(EV.PAGE_UPDATED, { id: cur.id, slug: r.value.slug, title: r.value.title, status });
  res.json({ ok: true, page: one("SELECT * FROM pages WHERE id=?", cur.id) });
});

cms.delete("/pages/:id", (req, res) => {
  const cur = one("SELECT * FROM pages WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "الصفحة غير موجودة");
  if (["terms", "privacy", "about", "contact"].includes(cur.slug))
    return failure(res, 409, "هذه صفحة أساسية لا يمكن حذفها");
  run("DELETE FROM pages WHERE id=?", cur.id);
  logEvent({ type: "page.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "page", entityId: cur.id, entityLabel: cur.title, ip: requestIp(req) });
  emitToAll(EV.PAGE_DELETED, { id: cur.id, slug: cur.slug });
  res.json({ ok: true });
});

/* ============================================================
   التصنيفات
============================================================ */
cms.get("/categories", (req, res) => {
  res.json({
    ok: true,
    categories: all(
      `SELECT c.*, (SELECT COUNT(*) FROM articles a WHERE a.category_id=c.id) articles_count
       FROM categories c ORDER BY c.name`,
    ),
  });
});

cms.post("/categories", (req, res) => {
  const r = parse(categorySchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  if (one("SELECT id FROM categories WHERE name=?", r.value.name))
    return failure(res, 409, "التصنيف موجود مسبقاً");
  const id = uid("CAT");
  run("INSERT INTO categories (id,name,slug,description,created_at) VALUES (?,?,?,?,?)",
    id, r.value.name, r.value.slug || slugOf(r.value.name), r.value.description || "", now());
  logEvent({ type: "category.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "category", entityId: id, entityLabel: r.value.name, ip: requestIp(req) });
  emitToAll(EV.CATEGORY_UPDATED, { id, name: r.value.name, slug: r.value.slug });
  res.json({ ok: true, category: one("SELECT * FROM categories WHERE id=?", id) });
});

cms.put("/categories/:id", (req, res) => {
  const cur = one("SELECT * FROM categories WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "التصنيف غير موجود");
  const r = parse(categorySchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields });
  if (one("SELECT id FROM categories WHERE name=? AND id!=?", r.value.name, cur.id))
    return failure(res, 409, "التصنيف موجود مسبقاً");
  run("UPDATE categories SET name=?, slug=?, description=? WHERE id=?",
    r.value.name, r.value.slug || slugOf(r.value.name), r.value.description || "", cur.id);
  logEvent({ type: "category.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "category", entityId: cur.id, entityLabel: r.value.name, ip: requestIp(req) });
  emitToAll(EV.CATEGORY_UPDATED, { id: cur.id, name: r.value.name, slug: r.value.slug });
  res.json({ ok: true });
});

cms.delete("/categories/:id", (req, res) => {
  const cur = one("SELECT * FROM categories WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "التصنيف غير موجود");
  const used = Number(one("SELECT COUNT(*) c FROM articles WHERE category_id=?", cur.id).c);
  if (used > 0)
    return failure(res, 409, `لا يمكن حذف تصنيف مرتبط بـ ${arCount(used, { one: "مقال واحد", two: "مقالين", few: "مقالات", many: "مقالاً" })}`);
  run("DELETE FROM categories WHERE id=?", cur.id);
  logEvent({ type: "category.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "category", entityId: cur.id, entityLabel: cur.name, ip: requestIp(req) });
  emitToAll(EV.CATEGORY_DELETED, { id: cur.id });
  res.json({ ok: true });
});

/* ============================================================
   البانرات
============================================================ */
cms.get("/banners", (req, res) => {
  res.json({
    ok: true,
    banners: all(
      `WITH c AS (SELECT banner_id, COUNT(*) c FROM banner_clicks GROUP BY banner_id)
       SELECT b.*, COALESCE(c.c,0) clicks, (SELECT COUNT(*) FROM requests r WHERE r.offer_id=b.related_offer_id) offer_requests
       FROM banners b LEFT JOIN c ON c.banner_id=b.id ORDER BY b.ord ASC, b.created_at DESC`,
    ),
  });
});

cms.post("/banners", (req, res) => {
  const b = req.body || {};
  if (!String(b.image || "").trim())
    return failure(res, 422, "يرجى اختيار صورة للبانر", { fields: { image: "يرجى اختيار صورة" } });
  const id = uid("BNR");
  const status = b.status === "published" ? "published" : "draft";
  run(
    `INSERT INTO banners (id,headline,subline,button_text,button_link,image,related_offer_id,position,status,ord,start_date,end_date,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, String(b.headline || "").slice(0, 200), String(b.subline || "").slice(0, 300),
    String(b.button_text || "").slice(0, 60), String(b.button_link || "").slice(0, 300),
    String(b.image || "").trim(), b.related_offer_id || null, b.position === "about" ? "about" : "hero",
    status, Number(b.ord || 0), b.start_date || null, b.end_date || null, now(), now(),
  );
  logEvent({ type: "banner.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "banner", entityId: id, ip: requestIp(req) });
  emitToAll(EV.BANNER_CREATED, { id });
  res.json({ ok: true, banner: one("SELECT * FROM banners WHERE id=?", id) });
});

cms.put("/banners/:id", (req, res) => {
  const cur = one("SELECT * FROM banners WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "البانر غير موجود");
  const b = req.body || {};
  const image = String(b.image || "").trim() || cur.image;
  run(
    `UPDATE banners SET headline=?,subline=?,button_text=?,button_link=?,image=?,related_offer_id=?,position=?,status=?,ord=?,start_date=?,end_date=?,updated_at=? WHERE id=?`,
    String(b.headline ?? cur.headline).slice(0, 200), String(b.subline ?? cur.subline).slice(0, 300),
    String(b.button_text ?? cur.button_text).slice(0, 60), String(b.button_link ?? cur.button_link).slice(0, 300),
    image, b.related_offer_id ?? cur.related_offer_id, b.position === "about" ? "about" : (b.position ?? cur.position),
    b.status ?? cur.status, Number(b.ord ?? cur.ord), b.start_date ?? cur.start_date, b.end_date ?? cur.end_date, now(), cur.id,
  );
  logEvent({ type: "banner.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "banner", entityId: cur.id, ip: requestIp(req) });
  emitToAll(EV.BANNER_UPDATED, { id: cur.id });
  res.json({ ok: true, banner: one("SELECT * FROM banners WHERE id=?", cur.id) });
});

cms.delete("/banners/:id", (req, res) => {
  const cur = one("SELECT * FROM banners WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "البانر غير موجود");
  run("DELETE FROM banners WHERE id=?", cur.id);
  logEvent({ type: "banner.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "banner", entityId: cur.id, ip: requestIp(req) });
  emitToAll(EV.BANNER_DELETED, { id: cur.id });
  res.json({ ok: true });
});

/* ============================================================
   القوائم
============================================================ */
cms.get("/menus", (req, res) => {
  res.json({ ok: true, menus: all("SELECT * FROM menus ORDER BY ord ASC, name") });
});

cms.post("/menus", (req, res) => {
  const m = req.body || {};
  if (!String(m.name || "").trim()) return failure(res, 422, "اسم القائمة مطلوب");
  if (!["link", "page", "category", "section"].includes(m.destination)) return failure(res, 422, "نوع الرابط غير صالح");
  const id = uid("MNU");
  run(
    "INSERT INTO menus (id,name,destination,target,ord,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)",
    id, String(m.name).slice(0, 60), m.destination, String(m.target || "").slice(0, 300),
    Number(m.ord || 0), m.status === "published" ? "published" : "draft", now(), now(),
  );
  logEvent({ type: "menu.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "menu", entityId: id, entityLabel: m.name, ip: requestIp(req) });
  emitToAll(EV.MENU_UPDATED, { id });
  res.json({ ok: true, menu: one("SELECT * FROM menus WHERE id=?", id) });
});

cms.put("/menus/:id", (req, res) => {
  const cur = one("SELECT * FROM menus WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "القائمة غير موجودة");
  const m = req.body || {};
  run(
    "UPDATE menus SET name=?,destination=?,target=?,ord=?,status=?,updated_at=? WHERE id=?",
    String(m.name ?? cur.name).slice(0, 60), m.destination ?? cur.destination, String(m.target ?? cur.target).slice(0, 300),
    Number(m.ord ?? cur.ord), m.status ?? cur.status, now(), cur.id,
  );
  logEvent({ type: "menu.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "menu", entityId: cur.id, entityLabel: m.name, ip: requestIp(req) });
  emitToAll(EV.MENU_UPDATED, { id: cur.id });
  res.json({ ok: true });
});

cms.delete("/menus/:id", (req, res) => {
  const cur = one("SELECT * FROM menus WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "القائمة غير موجودة");
  run("DELETE FROM menus WHERE id=?", cur.id);
  logEvent({ type: "menu.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "menu", entityId: cur.id, entityLabel: cur.name, ip: requestIp(req) });
  emitToAll(EV.MENU_UPDATED, { id: cur.id, deleted: true });
  res.json({ ok: true });
});

/* ============================================================
   النصوص
   [M2] جدول texts مفتاحه الأساسي `key` ولا يملك عمود `id` إطلاقاً.
============================================================ */
cms.get("/texts", (req, res) => {
  res.json({ ok: true, texts: all("SELECT * FROM texts ORDER BY grp, key") });
});

cms.put("/texts/:key", (req, res) => {
  const t = one("SELECT * FROM texts WHERE key=?", req.params.key);
  if (!t) return failure(res, 404, "النص غير موجود");
  const value = String(req.body.value ?? "").trim().slice(0, 3000);
  run("UPDATE texts SET value=?, updated_at=? WHERE key=?", value, now(), t.key);
  /* [M2] entityId هو المفتاح — t.id كان دائماً undefined */
  logEvent({ type: "text.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "text", entityId: t.key, entityLabel: t.key, ip: requestIp(req) });
  broadcastTexts("update");
  res.json({ ok: true });
});

cms.post("/texts", (req, res) => {
  const key = String(req.body.key || "").trim().toLowerCase();
  const value = String(req.body.value || "").trim().slice(0, 3000);
  if (!/^[a-z0-9._-]{2,80}$/.test(key))
    return failure(res, 422, "مفتاح النص غير صالح — استخدم أحرفاً إنجليزية صغيرة وأرقاماً ونقاطاً وشرطات فقط (مثال: home.title)");
  if (one("SELECT key FROM texts WHERE key=?", key)) return failure(res, 409, "رمز النص هذا مستخدم مسبقاً");

  /* [M2] لا عمود id — الإدراج بالأعمدة الفعلية للجدول فقط */
  run(
    "INSERT INTO texts (key,grp,description,value,default_value,updated_at) VALUES (?,?,?,?,?,?)",
    key, "مخصص", "", value, value, now(),
  );
  logEvent({ type: "text.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "text", entityId: key, entityLabel: key, ip: requestIp(req) });
  broadcastTexts("create");
  res.json({ ok: true });
});

cms.delete("/texts/:key", (req, res) => {
  const t = one("SELECT * FROM texts WHERE key=?", req.params.key);
  if (!t) return failure(res, 404, "النص غير موجود");
  run("DELETE FROM texts WHERE key=?", t.key);
  logEvent({ type: "text.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "text", entityId: t.key, entityLabel: t.key, ip: requestIp(req) });
  broadcastTexts("delete");
  res.json({ ok: true });
});

/* ============================================================
   الوسائط
============================================================ */
cms.get("/media", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 30);
  const q = String(req.query.q || "");
  const files = all(
    `SELECT id,original_name,stored_name,path,mime,size,alt,created_by,created_at FROM media
     WHERE (?='' OR original_name LIKE ? ESCAPE '\\' OR stored_name LIKE ? ESCAPE '\\')
     ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, per, (page - 1) * per,
  );
  const total = Number(one(
    "SELECT COUNT(*) c FROM media WHERE (?='' OR original_name LIKE ? ESCAPE '\\' OR stored_name LIKE ? ESCAPE '\\')",
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`,
  ).c);
  res.json({ ok: true, media: files, pagination: pagination(page, per, total) });
});

/**
 * تسجيل ملف موجود مسبقاً في المكتبة.
 * يُقبل فقط مسار داخل media/ نتج عن رفع فعلي عبر /media/upload.
 */
cms.post("/media", (req, res) => {
  const m = req.body || {};
  const fname = String(m.path || "");
  if (!/^media\/[A-Za-z0-9._-]+$/.test(fname))
    return failure(res, 422, "مسار الملف غير صالح");

  const abs = path.join(config.uploadDir, fname);
  if (!abs.startsWith(mediaDir) || !fs.existsSync(abs))
    return failure(res, 404, "الملف المطلوب غير موجود على الخادم");

  const st = fs.statSync(abs);
  const storedName = path.basename(fname);
  const id = uid("MED");
  run(
    "INSERT INTO media (id,original_name,stored_name,path,mime,size,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
    id, sanitizeName(m.original_name || m.name) || storedName, storedName, fname,
    String(m.mime || "application/octet-stream"), Number(st.size) || 0, req.user.id, now(),
  );
  registerMediaFiles([{ path: fname, name: storedName, mime: String(m.mime || ""), size: Number(st.size) || 0 }], id, req.user.id);

  logEvent({ type: "media.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "media", entityId: id, entityLabel: storedName, ip: requestIp(req) });
  res.json({ ok: true, media: { ...toPublicAttachment({ path: fname, name: storedName, mime: String(m.mime || ""), size: Number(st.size) || 0 }), id, stored_name: storedName, original_name: storedName, created_at: now() } });
});

cms.delete("/media/:id", (req, res) => {
  const m = one("SELECT * FROM media WHERE id=?", req.params.id);
  if (!m) return failure(res, 404, "الملف المطلوب غير موجود");

  /* [M1] كان: SELECT path FROM offers …  وعمود path غير موجود في offers،
     فكان هذا المسار يفشل بـ 500 في كل استدعاء (للأدمن أيضاً). */
  const used = all(
    `SELECT image FROM offers WHERE image=?
     UNION ALL SELECT image FROM articles WHERE image=?
     UNION ALL SELECT image FROM banners WHERE image=?`,
    m.path, m.path, m.path,
  ).length;
  if (used > 0) return failure(res, 409, "هذا الملف مستخدم في المحتوى، احذفه من المحتوى أولاً");

  const abs = path.join(config.uploadDir, m.path);
  if (abs.startsWith(mediaDir)) safeUnlink(abs);
  unregisterAttachments("media", m.id);
  run("DELETE FROM media WHERE id=?", m.id);

  logEvent({ type: "media.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "media", entityId: m.id, entityLabel: m.original_name, ip: requestIp(req) });
  res.json({ ok: true });
});

/** رفع فعلي إلى مكتبة الوسائط (multipart) */
cms.post("/media/upload", uploader.array("files", config.maxFilesPerRequest), asyncH(async (req, res) => {
  if (!req.files?.length) return failure(res, 422, "يرجى اختيار ملف أولاً ثم الضغط على رفع");

  const { files, error } = consumeUploads(req, "media", { imagesOnly: false });
  if (error) return failure(res, 422, error);

  const out = [];
  for (const f of files) {
    const id = uid("MED");
    run(
      "INSERT INTO media (id,original_name,stored_name,path,mime,size,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)",
      id, f.original_name, f.storedName, f.path, f.mime, f.size, req.user.id, now(),
    );
    registerMediaFiles([{ path: f.path, name: f.name, mime: f.mime, size: f.size }], id, req.user.id);
    out.push({
      id,
      name: f.original_name,
      original_name: f.original_name,
      stored_name: f.storedName,
      path: f.path,
      mime: f.mime,
      size: f.size,
      url: `/api/up/${encodeURIComponent(f.storedName)}`,
      mediaUrl: `/api/up/${encodeURIComponent(f.storedName)}`,
    });
  }

  logEvent({
    type: "media.upload", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "media", details: { count: out.length }, ip: requestIp(req),
  });
  res.json({ ok: true, media: out });
}));

/* ============================================================
   الإعدادات
============================================================ */
cms.get("/settings", (req, res) => {
  res.json({ ok: true, settings: getAllSettings() });
});

cms.get("/settings/changes", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 25);
  const rows = all("SELECT * FROM settings_changes ORDER BY created_at DESC LIMIT ? OFFSET ?", per, (page - 1) * per);
  const total = Number(one("SELECT COUNT(*) c FROM settings_changes").c);
  res.json({
    ok: true,
    changes: rows.map((c) => ({ ...c, changes: jsonParse(c.changes, []) })),
    pagination: pagination(page, per, total),
  });
});

cms.put("/settings", (req, res) => {
  const cur = getAllSettings();
  const next = buildSettings(cur, req.body || {});
  saveSettings(next, req.user, requestIp(req));
  /* saveSettings يبث settings:updated بنفسه [RT-1] */
  res.json({ ok: true, settings: getSettings(), meta: publicMeta() });
});

/* ============================================================
   [C3] النسخة الاحتياطية

   ثلاث مشاكل كانت قائمة:
   1) SELECT * FROM users كان يُصدّر pass_hash و salt لكل المستخدمين.
   2) لا بوابة must_change — فأدمن بكلمة مرور مؤقتة كان يصدّر القاعدة كلها.
   3) JSON.stringify للقاعدة كاملة في الذاكرة → استنزاف عند نمو البيانات.

   الآن: قائمة أعمدة صريحة لكل جدول (بلا أعمدة حساسة)، وبثّ متدفق.
============================================================ */

/** أعمدة صريحة لكل جدول — أي عمود غير مذكور هنا لا يُصدَّر أبداً */
const BACKUP_COLUMNS = {
  users: ["id", "name", "email", "phone", "role", "active", "must_change", "created_at", "created_by", "last_login_at", "updated_at"],
  sessions: [], // لا تُصدَّر الجلسات إطلاقاً
  reset_tokens: [], // ولا توكنات الاستعادة
  offers: ["id", "title", "summary", "description_html", "terms_html", "image", "start_date", "end_date", "status", "version", "created_by", "updated_by", "created_at", "updated_at"],
  requests: ["id", "seq", "offer_id", "user_id", "notes", "files", "status", "reject_reason", "cancel_reason", "info_note", "assigned_to", "version", "created_at", "updated_at"],
  request_history: ["id", "request_id", "from_status", "to_status", "by_type", "by_id", "by_name", "note", "created_at"],
  request_info: ["id", "request_id", "reply", "files", "created_at"],
  tickets: ["id", "seq", "user_id", "request_id", "subject", "message", "files", "status", "assigned_to", "version", "created_at", "updated_at"],
  ticket_replies: ["id", "ticket_id", "by_type", "by_id", "by_name", "text", "files", "created_at"],
  articles: ["id", "title", "slug", "excerpt", "content_html", "image", "category_id", "meta_title", "meta_description", "status", "version", "created_by", "updated_by", "created_at", "updated_at"],
  pages: ["id", "title", "slug", "content_html", "image", "meta_title", "meta_description", "status", "version", "created_by", "updated_by", "created_at", "updated_at"],
  categories: ["id", "name", "slug", "description", "created_at"],
  banners: ["id", "name", "headline", "subline", "button_text", "button_link", "image", "related_offer_id", "position", "ord", "start_date", "end_date", "status", "version", "created_at", "updated_at"],
  menus: ["id", "name", "destination", "target", "ord", "status", "created_at", "updated_at"],
  texts: ["key", "grp", "description", "value", "default_value", "updated_at"],
  media: ["id", "original_name", "stored_name", "path", "mime", "size", "alt", "description", "created_by", "created_at"],
  notifications: ["id", "user_id", "type", "title", "body", "entity_type", "entity_id", "status", "read", "created_at"],
  events: ["id", "type", "actor_type", "actor_id", "actor_name", "entity_type", "entity_id", "entity_label", "ip", "created_at"],
  settings: ["key", "value", "updated_at"],
};

cms.get("/backup", (req, res) => {
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="mana-backup-${new Date().toISOString().slice(0, 10)}.json"`);
  res.setHeader("Cache-Control", "no-store");

  /* [C3] بثّ متدفق — لا تحميل القاعدة كاملة في الذاكرة */
  res.write(`{"version":2,"exported_at":${JSON.stringify(now())},"exported_by":${JSON.stringify(req.user.id)},"db":[`);

  const tables = Object.keys(BACKUP_COLUMNS).filter((t) => BACKUP_COLUMNS[t].length > 0);
  let first = true;
  for (const t of tables) {
    const cols = BACKUP_COLUMNS[t];
    let rows = [];
    try {
      rows = all(`SELECT ${cols.map((c) => `"${c}"`).join(",")} FROM ${t}`);
    } catch (e) {
      logger.warn("backup table skipped", { table: t, message: e.message });
      continue;
    }
    if (!first) res.write(",");
    first = false;
    res.write(`{"table":${JSON.stringify(t)},"columns":${JSON.stringify(cols)},"rows":[`);
    rows.forEach((row, i) => {
      if (i) res.write(",");
      res.write(JSON.stringify(cols.map((c) => row[c] ?? null)));
    });
    res.write("]}");
  }
  res.end("]}");

  logEvent({ type: "backup.export", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "system", entityLabel: "نسخة احتياطية", ip: requestIp(req) });
  logger.warn("database backup exported", { adminId: req.user.id, ip: requestIp(req) });
});

/* ============================================================
   مساعدات
============================================================ */
function slugOf(title) {
  return (
    String(title || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 80) ||
    uid("PG").toLowerCase()
  );
}

/** خريطة إعدادات — كل مفتاح مقيَّد بالنوع والحد */
function buildSettings(cur, body) {
  const s = { ...cur };
  const str = (k, max) => { if (body[k] !== undefined) s[k] = String(body[k]).trim().slice(0, max); };
  const num = (k, min, max) => {
    if (body[k] !== undefined && Number.isFinite(Number(body[k])))
      s[k] = Math.min(max, Math.max(min, Math.round(Number(body[k]))));
  };
  const bool = (k) => { if (body[k] !== undefined) s[k] = !!body[k]; };
  const date = (k) => {
    if (body[k] === null || body[k] === "") s[k] = "";
    else if (typeof body[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body[k])) s[k] = body[k];
  };

  str("name", 60); str("tagline", 120); str("description", 500);
  str("email", 250); str("phone", 60); str("address", 300); str("whatsapp", 60);
  str("copyright", 200); str("maintenanceTitle", 120); str("maintenanceMessage", 1000);
  str("privacySlug", 80); str("termsSlug", 80); str("logo", 500); str("favicon", 500);
  num("maxFileMB", 1, 100); num("featuredCount", 1, 48); num("articleCount", 0, 24); num("pageSize", 4, 50);
  bool("notifyNewUser"); bool("allowRegistration"); bool("allowCatalogView"); bool("maintenance");
  date("returnDate");

  if (Array.isArray(body.socials)) {
    s.socials = body.socials
      .filter((x) => x && typeof x === "object")
      .slice(0, 20)
      .map((x) => ({ type: String(x.type || "").slice(0, 40), url: String(x.url || "").trim().slice(0, 400) }));
  }
  if (Array.isArray(body.homeSections)) {
    const ids = new Set((cur.homeSections || []).map((h) => h.id));
    s.homeSections = body.homeSections
      .filter((h) => h && ids.has(h.id))
      .map((h) => ({ id: h.id, label: cur.homeSections.find((x) => x.id === h.id)?.label || h.id, enabled: !!h.enabled }));
  }
  return s;
}

/* يُستخدم في الاختبارات */
export { BACKUP_COLUMNS, buildSettings };
