import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { run, one, all, now } from "../db.js";
import { uid, pager, escapeLike, jsonParse } from "../lib/util.js";
import { parse, failure, asyncH, requireAuth, requestIp } from "../lib/http.js";
import { cleanHtml, articleSchema, pageSchema, categorySchema } from "../lib/validate.js";
import { toPublicAttachment, uploader, validateFile, persistFile } from "../lib/upload.js";
import { logEvent } from "../services/events.js";
import { saveSettings, getAllSettings, getSettings } from "../services/settings.js";
import { config } from "../config.js";

export const cms = Router();
cms.use(requireAuth);
cms.use((req, res, next) => {
  if (req.user.role !== "admin" && !req.path.startsWith("/media"))
    return failure(res, 404, "الصفحة غير موجودة");
  next();
});

/* =============== المقالات =============== */
cms.get("/articles", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 10);
  const q = String(req.query.q || "");
  const cat = String(req.query.category || "");
  const st = String(req.query.status || "");
  const rows = all(
    `SELECT a.id,a.title,a.slug,a.excerpt,a.status,a.image,a.category_id,a.created_at,a.updated_at,c.name category_name
     FROM articles a LEFT JOIN categories c ON c.id=a.category_id
     WHERE (?='' OR a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\')
       AND (?='' OR a.status=?) AND (?='' OR a.category_id=?)
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, cat, cat, per, (page - 1) * per,
  );
  const total = one(
    `SELECT COUNT(*) c FROM articles a
     WHERE (?='' OR a.title LIKE ? ESCAPE '\\' OR a.excerpt LIKE ? ESCAPE '\\')
       AND (?='' OR a.status=?) AND (?='' OR a.category_id=?)`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, st, st, cat, cat,
  ).c;
  res.json({ ok: true, articles: rows, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

cms.post("/articles", asyncH(async (req, res) => {
  const r = parse(articleSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const save = String(req.body.save || "draft");
  const status = save === "publish" ? "published" : "draft";
  if (status === "published" && !r.value.image)
    return failure(res, 422, "الصورة البارزة مطلوبة للنشر");
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
  res.json({ ok: true, article: one("SELECT * FROM articles WHERE id=?", id) });
}));

cms.put("/articles/:id", (req, res) => {
  const cur = one("SELECT * FROM articles WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "المقال غير موجود");
  if (Number(req.body.baseVersion || 0) && Number(req.body.baseVersion) !== cur.version)
    return failure(res, 409, "تم تعديل هذا المقال من قبل مستخدم آخر", { code: "CONFLICT" });
  const r = parse(articleSchema, { ...req.body, status: cur.status });
  if (r.error) return failure(res, 422, r.error);
  const next = { ...cur, ...r.value };
  if (req.body.save === "publish") {
    if (!next.image) return failure(res, 422, "الصورة البارزة مطلوبة للنشر");
    next.status = "published";
  }
  run(
    `UPDATE articles SET title=?,slug=?,excerpt=?,content_html=?,image=?,category_id=?,status=?,version=version+1,updated_by=?,updated_at=? WHERE id=?`,
    next.title, next.slug || slugOf(next.title), next.excerpt, cleanHtml(next.content_html), next.image,
    next.category_id || null, next.status, req.user.id, now(), cur.id,
  );
  logEvent({
    type: "article.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
    entityType: "article", entityId: cur.id, entityLabel: next.title, details: { changes: Object.keys(r.value) }, ip: requestIp(req),
  });
  res.json({ ok: true, article: one("SELECT * FROM articles WHERE id=?", cur.id) });
});

cms.delete("/articles/:id", (req, res) => {
  const cur = one("SELECT * FROM articles WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "المقال غير موجود");
  run("DELETE FROM articles WHERE id=?", cur.id);
  logEvent({ type: "article.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "article", entityId: cur.id, entityLabel: cur.title, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== الصفحات =============== */
cms.get("/pages", (req, res) => {
  res.json({ ok: true, pages: all("SELECT * FROM pages ORDER BY created_at DESC") });
});

cms.post("/pages", asyncH(async (req, res) => {
  const r = parse(pageSchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  const exists = one("SELECT id FROM pages WHERE slug=?", r.value.slug);
  if (exists) return failure(res, 409, "هذا المعرف مستخدم من قبل صفحة أخرى");
  const id = uid("PGE");
  run(
    `INSERT INTO pages (id,title,slug,content_html,status,created_by,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    id, r.value.title, r.value.slug, cleanHtml(r.value.content_html), req.body.save === "publish" ? "published" : "draft",
    req.user.id, now(), now(),
  );
  logEvent({ type: "page.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "page", entityId: id, entityLabel: r.value.title, ip: requestIp(req) });
  res.json({ ok: true, page: one("SELECT * FROM pages WHERE id=?", id) });
}));

cms.put("/pages/:id", (req, res) => {
  const cur = one("SELECT * FROM pages WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "الصفحة غير موجودة");
  const r = parse(pageSchema, { ...req.body, status: cur.status });
  if (r.error) return failure(res, 422, r.error);
  if (one("SELECT id FROM pages WHERE slug=? AND id!=?", r.value.slug, cur.id))
    return failure(res, 409, "هذا المعرف مستخدم من قبل صفحة أخرى");
  run(
    `UPDATE pages SET title=?,slug=?,content_html=?,status=?,updated_by=?,updated_at=? WHERE id=?`,
    r.value.title, r.value.slug, cleanHtml(r.value.content_html), req.body.save === "publish" ? "published" : cur.status,
    req.user.id, now(), cur.id,
  );
  logEvent({ type: "page.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "page", entityId: cur.id, entityLabel: r.value.title, ip: requestIp(req) });
  res.json({ ok: true, page: one("SELECT * FROM pages WHERE id=?", cur.id) });
});

cms.delete("/pages/:id", (req, res) => {
  const cur = one("SELECT * FROM pages WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "الصفحة غير موجودة");
  const essential = ["terms", "privacy", "about", "contact"];
  if (essential.includes(cur.slug)) return failure(res, 409, "هذه صفحة أساسية لا يمكن حذفها");
  run("DELETE FROM pages WHERE id=?", cur.id);
  logEvent({ type: "page.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "page", entityId: cur.id, entityLabel: cur.title, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== التصنيفات =============== */
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
  if (r.error) return failure(res, 422, r.error);
  if (one("SELECT id FROM categories WHERE name=?", r.value.name))
    return failure(res, 409, "التصنيف موجود مسبقاً");
  const id = uid("CAT");
  run("INSERT INTO categories (id,name,slug) VALUES (?,?,?)", id, r.value.name, r.value.slug || slugOf(r.value.name));
  logEvent({ type: "category.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "category", entityId: id, entityLabel: r.value.name, ip: requestIp(req) });
  res.json({ ok: true, category: one("SELECT * FROM categories WHERE id=?", id) });
});

cms.put("/categories/:id", (req, res) => {
  const cur = one("SELECT * FROM categories WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "التصنيف غير موجود");
  const r = parse(categorySchema, req.body);
  if (r.error) return failure(res, 422, r.error);
  if (one("SELECT id FROM categories WHERE name=? AND id!=?", r.value.name, cur.id))
    return failure(res, 409, "التصنيف موجود مسبقاً");
  run("UPDATE categories SET name=?, slug=? WHERE id=?", r.value.name, r.value.slug || slugOf(r.value.name), cur.id);
  logEvent({ type: "category.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "category", entityId: cur.id, entityLabel: r.value.name, ip: requestIp(req) });
  res.json({ ok: true });
});

cms.delete("/categories/:id", (req, res) => {
  const cur = one("SELECT * FROM categories WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "التصنيف غير موجود");
  const used = one("SELECT COUNT(*) c FROM articles WHERE category_id=?", cur.id).c;
  if (used > 0) return failure(res, 409, `لا يمكن حذف تصنيف مرتبط بـ ${used} مقال`);
  run("DELETE FROM categories WHERE id=?", cur.id);
  logEvent({ type: "category.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "category", entityId: cur.id, entityLabel: cur.name, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== البانرات =============== */
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
  if (!String(b.image || "").trim()) return failure(res, 422, "الصورة مطلوبة", { fields: { image: "مطلوب" } });
  const id = uid("BNR");
  run(
    `INSERT INTO banners (id,headline,subline,button_text,button_link,image,related_offer_id,position,status,ord,start_date,end_date,created_at,updated_at)
     VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
    id, String(b.headline || "").slice(0, 200), String(b.subline || "").slice(0, 300),
    String(b.button_text || "").slice(0, 60), String(b.button_link || "").slice(0, 300),
    String(b.image || "").trim(), b.related_offer_id || null, b.position === "about" ? "about" : "hero",
    b.status === "published" ? "published" : "draft", Number(b.ord || 0),
    b.start_date || null, b.end_date || null, now(), now(),
  );
  logEvent({ type: "banner.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "banner", entityId: id, ip: requestIp(req) });
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
  res.json({ ok: true, banner: one("SELECT * FROM banners WHERE id=?", cur.id) });
});

cms.delete("/banners/:id", (req, res) => {
  const cur = one("SELECT * FROM banners WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "البانر غير موجود");
  run("DELETE FROM banners WHERE id=?", cur.id);
  logEvent({ type: "banner.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "banner", entityId: cur.id, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== القوائم =============== */
cms.get("/menus", (req, res) => {
  res.json({ ok: true, menus: all("SELECT * FROM menus ORDER BY ord ASC, name") });
});

cms.post("/menus", (req, res) => {
  const m = req.body || {};
  if (!String(m.name || "").trim()) return failure(res, 422, "اسم القائمة مطلوب");
  if (!["link", "page", "category", "section"].includes(m.destination)) return failure(res, 422, "نوع الوجهة غير صالح");
  const id = uid("MNU");
  run(
    `INSERT INTO menus (id,name,destination,target,ord,status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)`,
    id, String(m.name).slice(0, 60), m.destination, String(m.target || "").slice(0, 300),
    Number(m.ord || 0), m.status === "published" ? "published" : "draft", now(), now(),
  );
  logEvent({ type: "menu.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "menu", entityId: id, entityLabel: m.name, ip: requestIp(req) });
  res.json({ ok: true, menu: one("SELECT * FROM menus WHERE id=?", id) });
});

cms.put("/menus/:id", (req, res) => {
  const cur = one("SELECT * FROM menus WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "القائمة غير موجودة");
  const m = req.body || {};
  run(
    `UPDATE menus SET name=?,destination=?,target=?,ord=?,status=?,updated_at=? WHERE id=?`,
    String(m.name ?? cur.name).slice(0, 60), m.destination ?? cur.destination, String(m.target ?? cur.target).slice(0, 300),
    Number(m.ord ?? cur.ord), m.status ?? cur.status, now(), cur.id,
  );
  logEvent({ type: "menu.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "menu", entityId: cur.id, entityLabel: cur.name, ip: requestIp(req) });
  res.json({ ok: true });
});

cms.delete("/menus/:id", (req, res) => {
  const cur = one("SELECT * FROM menus WHERE id=?", req.params.id);
  if (!cur) return failure(res, 404, "القائمة غير موجودة");
  run("DELETE FROM menus WHERE id=?", cur.id);
  logEvent({ type: "menu.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "menu", entityId: cur.id, entityLabel: cur.name, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== النصوص =============== */
cms.get("/texts", (req, res) => {
  res.json({ ok: true, texts: all("SELECT * FROM texts ORDER BY grp, key") });
});

cms.put("/texts/:key", (req, res) => {
  const t = one("SELECT * FROM texts WHERE key=?", req.params.key);
  if (!t) return failure(res, 404, "النص غير موجود");
  const value = String(req.body.value ?? "").trim().slice(0, 3000);
  run("UPDATE texts SET value=?, updated_at=? WHERE key=?", value, now(), t.key);
  logEvent({ type: "text.update", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "text", entityId: t.id, entityLabel: t.key, ip: requestIp(req) });
  res.json({ ok: true });
});

cms.post("/texts", (req, res) => {
  const key = String(req.body.key || "").trim().toLowerCase();
  const value = String(req.body.value || "").trim().slice(0, 3000);
  if (!/^[a-z0-9._-]{2,80}$/.test(key)) return failure(res, 422, "معرف النص غير صالح");
  if (one("SELECT key FROM texts WHERE key=?", key)) return failure(res, 409, "هذا المعرف موجود مسبقاً");
  const id = uid("TXT");
  run(
    `INSERT INTO texts (id,key,grp,description,value,default_value,updated_at) VALUES (?,?,?,?,?,?,?)`,
    id, key, "مخصص", "", value, value, now(),
  );
  logEvent({ type: "text.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "text", entityId: id, entityLabel: key, ip: requestIp(req) });
  res.json({ ok: true });
});

cms.delete("/texts/:key", (req, res) => {
  const t = one("SELECT * FROM texts WHERE key=?", req.params.key);
  if (!t) return failure(res, 404, "النص غير موجود");
  run("DELETE FROM texts WHERE key=?", t.key);
  logEvent({ type: "text.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "text", entityId: t.id, entityLabel: t.key, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =============== الوسائط =============== */
cms.get("/media", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 30);
  const q = String(req.query.q || "");
  const files = all(
    `SELECT * FROM media WHERE (?='' OR original_name LIKE ? ESCAPE '\\' OR stored_name LIKE ? ESCAPE '\\') ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`, per, (page - 1) * per,
  );
  const total = one(`SELECT COUNT(*) c FROM media WHERE (?='' OR original_name LIKE ? ESCAPE '\\' OR stored_name LIKE ? ESCAPE '\\')`, q, `%${escapeLike(q)}%`, `%${escapeLike(q)}%`).c;
  res.json({ ok: true, media: files, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

cms.post("/media", (req, res) => {
  const m = req.body || {};
  const fname = String(m.path || "");
  const id = uid("MED");
  const pub = toPublicAttachment({ path: fname, name: String(m.name || fname), mime: String(m.mime || "application/octet-stream"), size: Number(m.size || 0) });
  run(
    `INSERT INTO media (id,original_name,stored_name,path,mime,size,created_by,created_at) VALUES (?,?,?,?,?,?,?,?)`,
    id, String(m.original_name || m.name || fname), String(m.stored_name || fname.split("/").pop() || fname), fname, String(m.mime || ""), Number(m.size || 0), req.user.id, now(),
  );
  logEvent({ type: "media.create", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "media", entityId: id, entityLabel: m.name || fname, ip: requestIp(req) });
  res.json({ ok: true, media: { ...pub, id, created_at: now() } });
});

cms.delete("/media/:id", (req, res) => {
  const m = one("SELECT * FROM media WHERE id=?", req.params.id);
  if (!m) return failure(res, 404, "الملف غير موجود");
  const used = all("SELECT path FROM offers WHERE image=? UNION ALL SELECT image FROM articles WHERE image=? UNION ALL SELECT image FROM banners WHERE image=?", m.path, m.path, m.path).length;
  if (used > 0) return failure(res, 409, "الملف مستخدم في المحتوى، لا يمكن حذفه");
  try {
    const abs = path.join(config.dataDir, "uploads", m.path);
    if (abs.startsWith(config.dataDir) && fs.existsSync(abs)) fs.unlinkSync(abs);
  } catch { /* تجاهل */ }
  run("DELETE FROM media WHERE id=?", m.id);
  logEvent({ type: "media.delete", actorType: "admin", actorId: req.user.id, actorName: req.user.name, entityType: "media", entityId: m.id, entityLabel: m.name, ip: requestIp(req) });
  res.json({ ok: true });
});

/* =====================================================================
   رفع الوسائط الحقيقي (multipart) ثم تسجيله — يُستخدم من مكتبة الوسائط
===================================================================== */
cms.post("/media/upload", uploader.array("files", 12), (req, res) => {
  try {
    if (!req.files?.length) return failure(res, 422, "لم يتم إرسال ملف");
    const out = [];
    for (const f of req.files) {
      const err = validateFile(f, { imagesOnly: false });
      if (err) return failure(res, 422, err);
      const saved = persistFile(f, "media"); // تخزين في مجلد media العام
      const id = uid("MED");
      run(
        `INSERT INTO media (id,original_name,stored_name,path,mime,size,created_by,created_at)
         VALUES (?,?,?,?,?,?,?,?)`,
        id, f.originalname || saved.storedName, saved.storedName, saved.path, f.mimetype, f.size, req.user.id, now(),
      );
      out.push({
        id, name: f.originalname || saved.storedName, path: saved.path,
        stored_name: saved.storedName, mime: f.mimetype, size: f.size,
        original_name: f.originalname || saved.storedName,
        url: `/api/up/${encodeURIComponent(saved.storedName)}`,
        mediaUrl: `/api/up/${encodeURIComponent(saved.storedName)}`,
      });
    }
    logEvent({
      type: "media.upload", actorType: "admin", actorId: req.user.id, actorName: req.user.name,
      entityType: "media", details: { count: out.length }, ip: requestIp(req),
    });
    res.json({ ok: true, media: out });
  } catch (e) {
    failure(res, 500, e.message);
  }
});

/* =============== الإعدادات =============== */
cms.get("/settings", (req, res) => {
  res.json({ ok: true, settings: getAllSettings() });
});

cms.get("/settings/changes", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 25);
  const rows = all(
    "SELECT * FROM settings_changes ORDER BY created_at DESC LIMIT ? OFFSET ?",
    per, (page - 1) * per,
  );
  const total = one("SELECT COUNT(*) c FROM settings_changes").c;
  res.json({
    ok: true,
    changes: rows.map((c) => ({ ...c, changes: jsonParse(c.changes, []) })),
    pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) },
  });
});

cms.put("/settings", (req, res) => {
  const cur = getAllSettings();
  const body = req.body || {};
  const next = buildSettings(cur, body);
  saveSettings(next, req.user, requestIp(req));
  res.json({ ok: true, settings: getSettings() });
});

/* =============== النسخ الاحتياطي =============== */
cms.get("/backup", (req, res) => {
  const backup = [];
  for (const t of ["users", "offers", "requests", "request_history", "request_info", "tickets", "ticket_replies", "articles", "pages", "categories", "banners", "menus", "texts", "media", "notifications", "events", "settings"]) {
    try {
      backup.push({ table: t, rows: all(`SELECT * FROM ${t}`) });
    } catch { /* تجاهل جدول غير موجود */ }
  }
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", "attachment; filename=mana-backup.json");
  res.send(JSON.stringify({ version: 1, exported_at: now(), db: backup }, null, 2));
});

/* =============== مساعدات =============== */
function slugOf(title) {
  return String(title || "").trim().toLowerCase().replace(/\s+/g, "-").replace(/[^\p{L}\p{N}-]/gu, "").slice(0, 80) || uid("PG").toLowerCase();
}

/* خريطة إعدادات متطابقة مع DEFAULT_SETTINGS — كل مفتاح يُقيَّد بالنوع والحد */
function buildSettings(cur, body) {
  const s = { ...cur };
  const str = (k, max) => { if (body[k] !== undefined) s[k] = String(body[k]).trim().slice(0, max); };
  const num = (k, min, max) => { if (body[k] !== undefined && Number.isFinite(Number(body[k]))) s[k] = Math.min(max, Math.max(min, Math.round(Number(body[k])))); };
  const bool = (k) => { if (body[k] !== undefined) s[k] = body[k] ? true : false; };
  const date = (k) => { if (body[k] === null || body[k] === "") { s[k] = ""; } else if (typeof body[k] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body[k])) s[k] = body[k]; };

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
