import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { one, all, run, now } from "../db.js";
import { uid, pager, getSessionUser } from "../lib/util.js";
import { requireAuth, failure, requestIp } from "../lib/http.js";
import { publicMeta, getSettings } from "../services/settings.js";
import { cleanHtml } from "../lib/validate.js";
import { config } from "../config.js";

export const pub = Router();

const TODAY = () => new Date().toISOString().slice(0, 10);

/** وصف عام للزائر مع حالة الصيانة */
pub.get("/meta", (req, res) => {
  res.json({ ok: true, meta: publicMeta() });
});

function visibleOffers(where = "", params = []) {
  return all(
    `SELECT id,title,summary,image,start_date,end_date,status,created_at
     FROM offers WHERE status='published'
     AND (start_date IS NULL OR start_date<=?)
     AND (end_date IS NULL OR end_date>=?) ${where}
     ORDER BY created_at DESC`,
    TODAY(), TODAY(), ...params,
  );
}

pub.get("/offers", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 12);
  const q = String(req.query.q || "").trim();
  let rows = visibleOffers("", []);
  if (q) rows = rows.filter((o) => (o.title + o.summary).includes(q));
  if (req.query.sort === "oldest") rows.reverse();
  const total = rows.length;
  const items = rows.slice((page - 1) * per, page * per);
  res.json({ ok: true, offers: items, pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

pub.get("/offers/:id", (req, res) => {
  const o = one(
    `SELECT * FROM offers WHERE id=? AND status='published'
     AND (start_date IS NULL OR start_date<=?) AND (end_date IS NULL OR end_date>=?)`,
    req.params.id, TODAY(), TODAY(),
  );
  if (!o) return res.status(404).json({ ok: false, error: "العرض غير متاح" });
  const expired = !!o.end_date && o.end_date < TODAY();
  let activeRequestId = null;
  const raw = req.cookies?.nama_sid || "";
  const user = raw ? getSessionUser(raw) : null;
  if (user?.role === "client") {
    const r = one(
      `SELECT id FROM requests WHERE user_id=? AND offer_id=? AND status NOT IN ('cancelled','rejected','closed') ORDER BY created_at DESC LIMIT 1`,
      user.id, o.id,
    );
    activeRequestId = r?.id || null;
  }
  res.json({ ok: true, offer: { ...o, description_html: cleanHtml(o.description_html), terms_html: cleanHtml(o.terms_html) }, activeRequestId, expired });
});

pub.get("/categories", (req, res) => {
  res.json({ ok: true, categories: all("SELECT id,name,slug FROM categories ORDER BY name") });
});

/* قوائم التنقل المنشورة (تصفها الإدارة من CMS) */
pub.get("/menus", (req, res) => {
  const rows = all(
    `SELECT id,name,destination,target,ord FROM menus
     WHERE status='published' ORDER BY ord ASC, name ASC`,
  );
  res.json({ ok: true, menus: rows });
});

/* نصوص عامة قابلة للتخصيص من الإدارة */
pub.get("/texts", (req, res) => {
  const rows = all("SELECT key,value FROM texts ORDER BY key");
  res.json({ ok: true, texts: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

pub.get("/articles", (req, res) => {
  const { page, per } = pager(req.query.page, req.query.per || 9);
  const cat = req.query.category || "";
  const rows = all(
    `SELECT a.id,a.title,a.slug,a.excerpt,a.image,a.created_at,c.name category_name
     FROM articles a LEFT JOIN categories c ON c.id=a.category_id
     WHERE a.status='published' ${cat ? "AND a.category_id=?" : ""}
     ORDER BY a.created_at DESC`,
    ...(cat ? [cat] : []),
  );
  const total = rows.length;
  res.json({ ok: true, articles: rows.slice((page - 1) * per, page * per), pagination: { page, per, total, pages: Math.max(1, Math.ceil(total / per)) } });
});

pub.get("/articles/:id", (req, res) => {
  const a = one(
    `SELECT a.*, c.name category_name FROM articles a LEFT JOIN categories c ON c.id=a.category_id
     WHERE a.id=? AND a.status='published'`,
    req.params.id,
  );
  if (!a) return res.status(404).json({ ok: false, error: "المقال غير متاح" });
  const related = all(
    `SELECT id,title,excerpt,image FROM articles WHERE status='published' AND id!=? AND (? IS NULL OR category_id=?) ORDER BY created_at DESC LIMIT 3`,
    a.id, a.category_id, a.category_id,
  );
  res.json({ ok: true, article: { ...a, content_html: cleanHtml(a.content_html) }, related });
});

pub.get("/pages/:slug", (req, res) => {
  const p = one("SELECT * FROM pages WHERE slug=? AND status='published'", req.params.slug);
  if (!p) return res.status(404).json({ ok: false, error: "الصفحة غير متاحة" });
  res.json({ ok: true, page: { ...p, content_html: cleanHtml(p.content_html) } });
});

/* تسجيل نقرات البانرات (إحصاءات لوحة الإدارة) */
pub.get("/banners/:id/click", (req, res) => {
  const b = one("SELECT id FROM banners WHERE id=? AND status='published'", req.params.id);
  if (!b) return res.json({ ok: true });
  try {
    const raw = req.cookies?.nama_sid || "";
    const user = raw ? getSessionUser(raw) : null;
    run(
      "INSERT INTO banner_clicks (id,banner_id,user_id,ip,created_at) VALUES (?,?,?,?,?)",
      uid("BCL"), b.id, user?.id || null, requestIp(req), now(),
    );
  } catch { /* لا يفشل التصفح */ }
  res.json({ ok: true });
});

/** بيانات الصفحة الرئيسية: بنر معروض + عروض مميزة + مقالات */
pub.get("/home", (req, res) => {
  const meta = publicMeta();
  const banners = all(
    `SELECT id,headline,subline,button_text,button_link,image,ord FROM banners
     WHERE status='published' AND position='hero'
     AND (start_date IS NULL OR start_date<=?) AND (end_date IS NULL OR end_date>=?)
     ORDER BY ord ASC, created_at DESC`,
    TODAY(), TODAY(),
  );
  const offers = visibleOffers("", []).slice(0, meta.homeSections.find((s) => s.id === "offers")?.enabled === false ? 0 : meta.featuredCount);
  const arts = all(
    `SELECT id,title,excerpt,image,created_at FROM articles WHERE status='published' ORDER BY created_at DESC LIMIT ?`,
    meta.homeSections.find((s) => s.id === "articles")?.enabled === false ? 0 : meta.articleCount,
  );
  res.json({ ok: true, banners, offers, articles: arts, meta });
});

/** عداد الإشعارات لأي مستخدم مسجل */
pub.get("/notifications/unread", requireAuth, (req, res) => {
  const n = one("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", req.user.id);
  res.json({ ok: true, unread: Number(n.c) });
});

/* عرض صور المحتوى العام بأمان — media فقط، لا مرفقات خاصة */
pub.get("/up/:name", (req, res) => {
  const name = req.params.name || "";
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes(".."))
    return failure(res, 400, "مسار غير صالح");
  const abs = path.join(config.dataDir, "uploads", "media", name);
  if (!abs.startsWith(config.dataDir) || !fs.existsSync(abs))
    return failure(res, 404, "الملف غير موجود");
  res.setHeader("Cache-Control", "public, max-age=86400, immutable");
  fs.createReadStream(abs).pipe(res);
});

/** حالة الصيانة العامة (تُستخدم من قبل الواجهة) */
pub.get("/maintenance", (req, res) => {
  const s = getSettings();
  const html = s.maintenance
    ? `<div dir="rtl" style="font-family:Tajawal,system-ui;max-width:640px;margin:12vh auto;padding:2rem;text-align:center">
         <h1 style="font-size:2rem;margin-bottom:.5rem">${s.maintenanceTitle || "نعود إليك قريباً"}</h1>
         <p style="opacity:.8;line-height:1.9">${s.maintenanceMessage || "نعمل الآن على تحسين تجربتك."}</p>
         ${s.returnDate ? `<p style="opacity:.6">تاريخ العودة المتوقع: ${s.returnDate}</p>` : ""}
       </div>`
    : "";
  res.json({ ok: true, maintenance: !!s.maintenance, title: s.maintenanceTitle, message: s.maintenanceMessage, returnDate: s.returnDate || "", html });
});
