import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import { one, all, run, now } from "../db.js";
import { uid, pagination, escapeLike, sha256 } from "../lib/util.js";
import { parse, failure, asyncH, requireAuth, requestIp } from "../lib/http.js";
import { offerQuerySchema, requestCreateSchema } from "../lib/validate.js";
import { uploadCleanup } from "../lib/upload.js";
import { publicMeta, getSettings } from "../services/settings.js";
import { cleanHtml } from "../lib/validate.js";
import { createRequest, detail as requestDetail } from "../services/requests.js";
import { notifyAdmins } from "../services/notify.js";
import { logEvent } from "../services/events.js";
import { statsDirty } from "../services/realtime.js";
import { clickLimiter } from "../lib/limiter.js";
import { config, mediaDir } from "../config.js";

export const publicApi = Router();

const TODAY = () => new Date().toISOString().slice(0, 10);

/**
 * [M9] قائمة الأعمدة العامة للعروض.
 *
 * كان: SELECT * FROM offers — فاستقبل الزائر غير المسجّل
 * "created_by":"ADM-mtvkzqbv-2eb874" في كل عرض (تسريب معرّف داخلي).
 * ملاحظة: جدول offers لا يملك عمود category_id إطلاقاً (تحقق من المخطط)،
 * فالعروض غير مصنّفة — التصنيفات تخصّ المقالات فقط.
 */
const OFFER_PUBLIC_COLS =
  "id,title,summary,description_html,terms_html,image,start_date,end_date,status,version,created_at,updated_at";

const OFFER_VISIBLE =
  "status='published' AND (start_date IS NULL OR start_date<=?) AND (end_date IS NULL OR end_date>=?)";

function visibleOffers(limit = null, offset = 0, where = "", params = []) {
  return all(
    `SELECT ${OFFER_PUBLIC_COLS} FROM offers
     WHERE ${OFFER_VISIBLE} ${where}
     ORDER BY created_at DESC ${limit == null ? "" : "LIMIT ? OFFSET ?"}`,
    TODAY(), TODAY(), ...params, ...(limit == null ? [] : [limit, offset]),
  );
}

function countVisibleOffers(where = "", params = []) {
  return Number(one(
    `SELECT COUNT(*) c FROM offers WHERE ${OFFER_VISIBLE} ${where}`,
    TODAY(), TODAY(), ...params,
  ).c);
}

/* ============================================================
   الإعدادات العامة
============================================================ */
let _metaCache = null;
function metaCached() {
  if (!_metaCache || Date.now() - _metaCache.t > 60_000) _metaCache = { t: Date.now(), v: publicMeta() };
  return _metaCache.v;
}
export function invalidateMetaCache() { _metaCache = null; }

publicApi.get("/meta", (req, res) => {
  res.json({ ok: true, meta: metaCached() });
});

publicApi.get("/maintenance", (req, res) => {
  const s = getSettings();
  res.json({
    ok: true,
    maintenance: !!s.maintenance,
    title: s.maintenanceTitle || "",
    message: s.maintenanceMessage || "",
    returnDate: s.returnDate || "",
  });
});

/* ============================================================
   [M3] العروض — الترقيم في SQL لا في JS
   كان: يُجلب كل العروض ثم rows.slice(...) — تكلفة خطية مع نمو البيانات.
============================================================ */
publicApi.get("/offers", (req, res) => {
  const r = parse(offerQuerySchema, req.query);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });
  const { value } = r;
  const q = value.q;

  const where = q ? "AND (title LIKE ? ESCAPE '\\' OR summary LIKE ? ESCAPE '\\')" : "";
  const params = q ? [`%${escapeLike(q)}%`, `%${escapeLike(q)}%`] : [];

  const sort = req.query.sort === "oldest" ? "ASC" : "DESC";
  const rows = all(
    `SELECT ${OFFER_PUBLIC_COLS} FROM offers
     WHERE ${OFFER_VISIBLE} ${where}
     ORDER BY created_at ${sort} LIMIT ? OFFSET ?`,
    TODAY(), TODAY(), ...params, value.per, value.offset,
  );
  const total = countVisibleOffers(where, params);

  res.json({ ok: true, offers: rows, pagination: pagination(value.page, value.per, total) });
});

publicApi.get("/offers/:id", (req, res) => {
  const o = one(`SELECT ${OFFER_PUBLIC_COLS} FROM offers WHERE id=? AND ${OFFER_VISIBLE}`,
    req.params.id, TODAY(), TODAY());
  if (!o) return failure(res, 404, "العرض غير متاح");

  const expired = !!o.end_date && o.end_date < TODAY();
  const related = all(
    `SELECT id,title,summary,image,start_date,end_date,status,created_at FROM offers
     WHERE ${OFFER_VISIBLE} AND id<>? ORDER BY created_at DESC LIMIT 4`,
    TODAY(), TODAY(), o.id,
  );

  /* حالة طلب العميل الحالي — تُقرأ من الكوكي إن وُجد، دون إلزام بتسجيل الدخول */
  let activeRequestId = null;
  const raw = req.cookies?.[config.sessionCookieName] || "";
  if (raw) {
    const s = one("SELECT user_id FROM sessions WHERE token_hash=? AND expires_at>?", sha256(raw), now());
    if (s) {
      const r = one(
        "SELECT id FROM requests WHERE user_id=? AND offer_id=? AND status NOT IN ('cancelled','rejected','closed') ORDER BY created_at DESC LIMIT 1",
        s.user_id, o.id,
      );
      activeRequestId = r?.id || null;
    }
  }

  res.json({
    ok: true,
    offer: { ...o, description_html: cleanHtml(o.description_html), terms_html: cleanHtml(o.terms_html) },
    related,
    activeRequestId,
    expired,
  });
});

/* ============================================================
   المقالات
============================================================ */
publicApi.get("/articles", (req, res) => {
  const r = parse(offerQuerySchema, req.query);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });
  const { value } = r;
  const per = Math.min(30, value.per);
  const cat = String(req.query.category || "");

  const rows = all(
    `SELECT a.id,a.title,a.slug,a.excerpt,a.image,a.created_at,a.updated_at,c.name category_name
     FROM articles a LEFT JOIN categories c ON c.id=a.category_id
     WHERE a.status='published' AND (?='' OR a.category_id=?)
     ORDER BY a.created_at DESC LIMIT ? OFFSET ?`,
    cat, cat, per, value.offset,
  );
  const total = Number(one(
    "SELECT COUNT(*) c FROM articles WHERE status='published' AND (?='' OR category_id=?)", cat, cat,
  ).c);

  res.json({ ok: true, articles: rows, pagination: pagination(value.page, per, total) });
});

publicApi.get("/articles/:id", (req, res) => {
  const a = one(
    `SELECT a.id,a.title,a.slug,a.excerpt,a.content_html,a.image,a.created_at,a.updated_at,a.category_id,
            c.name category_name
     FROM articles a LEFT JOIN categories c ON c.id=a.category_id
     WHERE a.id=? AND a.status='published'`,
    req.params.id,
  );
  if (!a) return failure(res, 404, "المقال غير متاح");

  const related = all(
    `SELECT id,title,excerpt,image FROM articles
     WHERE status='published' AND id!=? AND (? IS NULL OR category_id=?)
     ORDER BY created_at DESC LIMIT 3`,
    a.id, a.category_id, a.category_id,
  );

  res.json({ ok: true, article: { ...a, content_html: cleanHtml(a.content_html) }, related });
});

/* ============================================================
   الصفحات الثابتة
============================================================ */
publicApi.get("/pages/:slug", (req, res) => {
  const p = one(
    "SELECT id,title,slug,content_html,image,updated_at FROM pages WHERE slug=? AND status='published'",
    req.params.slug,
  );
  if (!p) return failure(res, 404, "الصفحة غير متاحة");
  res.json({ ok: true, page: { ...p, content_html: cleanHtml(p.content_html) } });
});

/* ============================================================
   التصنيفات والقوائم والنصوص
============================================================ */
publicApi.get("/categories", (req, res) => {
  res.json({
    ok: true,
    categories: all(
      `SELECT c.id,c.name,c.slug,c.description,
              (SELECT COUNT(*) FROM articles a WHERE a.category_id=c.id AND a.status='published') articles_count
       FROM categories c ORDER BY c.name`,
    ),
  });
});

publicApi.get("/menus", (req, res) => {
  res.json({
    ok: true,
    menus: all(
      `SELECT m.id,m.name,m.destination,m.target,m.ord
       FROM menus m LEFT JOIN pages p ON m.destination='page' AND p.slug=m.target
       WHERE m.status='published' AND (m.destination<>'page' OR p.status='published')
       ORDER BY m.ord ASC, m.name ASC`,
    ),
  });
});

publicApi.get("/texts", (req, res) => {
  const rows = all("SELECT key,value FROM texts ORDER BY key");
  res.json({ ok: true, texts: Object.fromEntries(rows.map((r) => [r.key, r.value])) });
});

/* ============================================================
   الصفحة الرئيسية
============================================================ */
publicApi.get("/home", (req, res) => {
  const meta = metaCached();
  const banners = all(
    `SELECT id,headline,subline,button_text,button_link,image,ord FROM banners
     WHERE status='published' AND position='hero'
       AND (start_date IS NULL OR start_date<=?) AND (end_date IS NULL OR end_date>=?)
     ORDER BY ord ASC, created_at DESC`,
    TODAY(), TODAY(),
  );
  const sectionOff = (id) => meta.homeSections?.find((s) => s.id === id)?.enabled === false;
  const offers = sectionOff("offers") ? [] : visibleOffers(Number(meta.featuredCount) || 6, 0);
  const articles = sectionOff("articles")
    ? []
    : all(
        "SELECT id,title,excerpt,image,created_at FROM articles WHERE status='published' ORDER BY created_at DESC LIMIT ?",
        Number(meta.articleCount) || 3,
      );
  res.json({ ok: true, banners, offers, articles, meta });
});

/* ============================================================
   عداد الإشعارات
============================================================ */
publicApi.get("/notifications/unread", requireAuth, (req, res) => {
  const n = one("SELECT COUNT(*) c FROM notifications WHERE user_id=? AND read=0", req.user.id);
  res.json({ ok: true, unread: Number(n.c) });
});

/* ============================================================
   [M11] نقرات البانر — POST مع حدّ لكل IP
   كان: GET /api/banners/:id/click — طلب GET يُجري كتابة، فأي <img src>
   أو زحف محرّك بحث كان ينفّخ العدّاد.
============================================================ */
publicApi.post("/banners/:id/click", clickLimiter, (req, res) => {
  const b = one("SELECT id FROM banners WHERE id=? AND status='published'", req.params.id);
  if (!b) return failure(res, 404, "البانر غير موجود");
  run(
    "INSERT INTO banner_clicks (id,banner_id,ip,created_at) VALUES (?,?,?,?)",
    uid("BCL"), b.id, requestIp(req), now(),
  );
  statsDirty("banner_click");
  res.json({ ok: true });
});

/* ============================================================
   [C7] صور المحتوى العامة — media/ فقط، مع Content-Type صحيح
   كان: fs.createReadStream بلا أي ترويسة Content-Type، فالمتصفح يخمّن
   النوع من الامتداد — وملف .svg يُنفَّذ كـ HTML.
   الآن: SVG مرفوض من قائمة الأنواع أصلاً، والترويسة تُضبط من الجدول.
============================================================ */
const MEDIA_MIME = {
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
};

publicApi.get("/up/:name", (req, res) => {
  const name = String(req.params.name || "");
  if (!/^[A-Za-z0-9._-]+$/.test(name) || name.includes(".."))
    return failure(res, 400, "الملف المطلوب غير متوفر");

  const abs = path.join(mediaDir, name);
  if (!abs.startsWith(mediaDir + path.sep) || !fs.existsSync(abs))
    return failure(res, 404, "الملف المطلوب غير متوفر أو تم حذفه");

  const mime = MEDIA_MIME[path.extname(name).toLowerCase()];
  if (!mime) return failure(res, 415, "نوع الملف غير مدعوم للعرض");

  res.setHeader("Content-Type", mime);
  res.setHeader("Content-Length", String(fs.statSync(abs).size));
  res.setHeader("Cache-Control", "public, max-age=86400");
  res.setHeader("X-Content-Type-Options", "nosniff");
  fs.createReadStream(abs).on("error", () => res.end()).pipe(res);
});

/* ============================================================
   [M15] إنشاء طلب — المرفقات تُسجَّل داخل المعاملة نفسها
   كان: التسجيل يحدث بعد الحفظ، فـ GET /api/files كان يفشل 404 للملف
   الذي رفعه العميل نفسه قبل لحظات.
============================================================ */
publicApi.post("/requests", uploadCleanup, asyncH(async (req, res) => {
  const r = parse(requestCreateSchema, req.body);
  if (r.error) return failure(res, 422, r.error, { fields: r.fields || {} });

  if (!req.user) return failure(res, 401, "يرجى تسجيل الدخول أولاً");
  if (req.user.role !== "client") return failure(res, 403, "الحسابات الإدارية لا تقدّم طلبات من الواجهة العامة");

  const offer = one(`SELECT id,title FROM offers WHERE id=? AND ${OFFER_VISIBLE}`,
    r.value.offer_id, TODAY(), TODAY());
  if (!offer) return failure(res, 404, "العرض غير موجود أو لم يعد متاحاً");

  const open = one(
    "SELECT id FROM requests WHERE offer_id=? AND user_id=? AND status NOT IN ('done','rejected','cancelled','closed')",
    offer.id, req.user.id,
  );
  if (open) return failure(res, 409, "لديك طلب مفتوح لهذا العرض مسبقاً — يمكنك متابعته من حسابك");

  const id = uid("REQ");
  const seq = Number(one("SELECT COALESCE(MAX(seq),1000)+1 c FROM requests").c);

  /* createRequest يسجّل المرفقات في المعاملة نفسها [M14/M15] */
  createRequest({
    id, seq, offerId: offer.id, userId: req.user.id,
    notes: r.value.notes, files: [], userName: req.user.name,
  });

  logEvent({
    type: "request.create", actorType: "client", actorId: req.user.id, actorName: req.user.name,
    entityType: "request", entityId: id, entityLabel: offer.title, ip: requestIp(req),
  });
  notifyAdmins({
    type: "request", title: "طلب جديد",
    body: `طلب جديد من العميل ${req.user.name} على العرض «${offer.title}»`,
    entityType: "request", entityId: id, ip: requestIp(req),
  });

  res.json({ ok: true, id, seq, request: requestDetail(id) });
}));

/* يُستخدم في الاختبارات */
export { OFFER_PUBLIC_COLS, visibleOffers, MEDIA_MIME };
