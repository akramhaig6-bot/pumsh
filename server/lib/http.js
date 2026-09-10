import crypto from "node:crypto";
import { ZodError } from "zod";
import { config } from "../config.js";
import { getSessionUser, loadSession, revokeSession, touchSession } from "./util.js";
import { checkRequestOrigin } from "./cors.js";
import logger from "./logger.js";

/* ============================================================
   أدوات Express
============================================================ */
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function failure(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}

/** تحليل zod مع رسائل حقول موحدة — لا رسالة إنجليزية تصل للعميل أبداً */
export function parse(schema, data) {
  try {
    return { value: schema.parse(data) };
  } catch (e) {
    if (e instanceof ZodError) {
      const fields = {};
      for (const i of e.issues) {
        const p = `${i.path[0] ?? "_"}`;
        fields[p] = fields[p] || i.message;
      }
      return { error: e.issues[0]?.message || "بيانات غير صالحة", fields };
    }
    logger.warn("zod unexpected error", { message: e.message });
    return { error: "بيانات غير صالحة" };
  }
}

/** خطأ HTTP يحمل رمز حالة — يلتقطه errorHandler */
export function httpError(status, message, extra = {}) {
  const e = new Error(message);
  e.status = status;
  Object.assign(e, extra);
  return e;
}

/* ============================================================
   المصادقة والصلاحيات
============================================================ */
export function getRawToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7).trim();
  return req.cookies?.[config.sessionCookieName] || "";
}

export function currentUser(req) {
  const raw = getRawToken(req);
  const s = loadSession(raw);
  if (!s) return null;
  touchSession(raw);
  req.sessionRaw = raw;
  req.sessionId = s.token_hash;
  return getSessionUser(raw);
}

/**
 * نسخة آمنة لـ getSessionUser — تُستخدم من Socket.IO حيث لا يوجد req.
 * لا ترمي استثناءً أبداً: توكن تالف يعني فقط مستخدماً مجهولاً في غرفة public.
 */
export function getSessionUserSafe(rawToken) {
  if (!rawToken || typeof rawToken !== "string") return null;
  try {
    const u = getSessionUser(rawToken);
    if (!u || !u.active) return null;
    return { id: u.id, role: u.role, name: u.name, must_change: u.must_change };
  } catch (e) {
    logger.debug("socket session resolve failed", { message: e.message });
    return null;
  }
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return failure(res, 401, "انتهت جلستك، يرجى تسجيل الدخول مرة أخرى");
  if (!user.active) {
    revokeSession(req.sessionRaw);
    return failure(res, 403, "تم إيقاف حسابك، يرجى التواصل معنا عبر صفحة «تواصل معنا»");
  }
  req.user = user;
  next();
}

/**
 * [C1/C3/M3] حاجز الأدمن الموحّد — لا استثناءات.
 * يُعيد 404 (لا 403) حتى لا يُكشف وجود لوحة الإدارة.
 */
export function requireAdmin(req, res, next) {
  if (!req.user) return failure(res, 401, "انتهت جلستك، يرجى تسجيل الدخول مرة أخرى");
  if (req.user.role !== "admin") return failure(res, 404, "الصفحة غير موجودة");
  next();
}

/**
 * [M3] بوابة كلمة المرور المؤقتة — تُطبَّق على كل مسارات الإدارة
 * (admin و cms معاً). الاستثناء الوحيد هو مسار تغيير كلمة المرور نفسه.
 */
export function requirePasswordChanged(req, res, next) {
  if (!req.user) return failure(res, 401, "انتهت جلستك، يرجى تسجيل الدخول مرة أخرى");
  if (req.user.must_change) {
    return failure(res, 403, "يجب تغيير كلمة المرور المؤقتة قبل المتابعة", { code: "MUST_CHANGE_PASSWORD" });
  }
  next();
}

/* ============================================================
   [M12] CSRF — توكن موقّع مرتبط بالجلسة + فحص Origin/Referer

   لماذا لا double-submit؟
   الكوكي القابل للقراءة يمكن زرعه من نطاق فرعي (cookie tossing)،
   وهذا يُبطل الحماية كلياً. لذلك:
     - التوكن = HMAC-SHA256(CSRF_SECRET, scope + نافذة زمنية)
     - scope = بصمة الجلسة إن وُجدت، وإلا "anon"
     - يُسلَّم عبر /api/auth/csrf في جسم الاستجابة فقط (لا كوكي قابل للقراءة)
     - يدور كل 30 دقيقة مع سماح نافذة واحدة للتداخل
     - طبقة ثانية: فحص Origin/Referer
============================================================ */
const CSRF_BUCKET_MS = 30 * 60 * 1000;

const b64u = (buf) => Buffer.from(buf).toString("base64url");
const unb64u = (s) => Buffer.from(String(s), "base64url").toString("utf8");

function hmac(value) {
  return crypto.createHmac("sha256", config.csrfSecret).update(value).digest("base64url");
}

/**
 * بصمة تُربط بها التوكن: الجلسة الحالية أو "anon".
 *
 * [M12] `overrideRaw` ضروري لا اختياري: عند الدخول/التسجيل يُضبط كوكي
 * الجلسة على *الاستجابة* عبر res.cookie()، بينما req.cookies ما زال يحمل
 * الحالة القديمة. بدونه يُسلَّم توكن مرتبط بـ "anon" فيلزم أول طلب معدِّل
 * بعد الدخول بفشل 403 CSRF_INVALID (تحقق فعلي قبل الإصلاح).
 */
const ANON = Symbol("anon");

function csrfScope(req, overrideRaw) {
  /* ANON = فرض نطاق مجهول (بعد الخروج)، null/undefined = اقرأ من الطلب */
  const raw = overrideRaw === ANON ? "" : overrideRaw || getRawToken(req);
  if (!raw) return "anon";
  return crypto.createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * إصدار توكن CSRF جديد.
 * @param {object} req
 * @param {string|null|Symbol} newSessionToken
 *        undefined/null → اقرأ الجلسة من الطلب،
 *        نص            → التوكن الجديد (دخول/تسجيل)،
 *        ANON          → فرض نطاق مجهول (خروج)
 */
export function issueCsrfToken(req, newSessionToken = null) {
  const scope = csrfScope(req, newSessionToken);
  const bucket = Math.floor(Date.now() / CSRF_BUCKET_MS);
  const payload = `${scope}.${bucket}`;
  return `${b64u(payload)}.${hmac(payload)}`;
}

export { ANON as CSRF_ANON };

/** التحقق من التوكن: التوقيع + الارتباط بالجلسة + حداثة النافذة */
export function verifyCsrfToken(req, token) {
  if (!token || typeof token !== "string") return false;
  const [p, sig] = token.split(".");
  if (!p || !sig) return false;

  const expected = hmac(unb64u(p));
  const a = Buffer.from(expected);
  const b = Buffer.from(String(sig));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;

  let payload = "";
  try {
    payload = unb64u(p);
  } catch {
    return false;
  }
  const [scope, bucketStr] = payload.split(".");
  const bucket = Number(bucketStr);
  if (!Number.isFinite(bucket)) return false;

  const now = Math.floor(Date.now() / CSRF_BUCKET_MS);
  /* نافذة حالية أو سابقة واحدة (سماح للتداخل) — ولا نقبل مستقبلاً */
  if (bucket !== now && bucket !== now - 1) return false;

  return scope === csrfScope(req);
}

/** وسيط حماية CSRF لكل الطلبات المُعدِّلة */
export function csrfProtect(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();

  /* الطبقة الأولى: Origin/Referer */
  const originProblem = checkRequestOrigin(req);
  if (originProblem) {
    logger.warn("csrf origin rejected", { reason: originProblem, path: req.path, method: req.method });
    return failure(res, 403, "تعذر التحقق من مصدر الطلب، يرجى تحديث الصفحة والمحاولة مجدداً", {
      code: "ORIGIN_REJECTED",
    });
  }

  /* الطبقة الثانية: التوكن الموقّع */
  const token = req.headers["x-csrf-token"] || "";
  if (!verifyCsrfToken(req, token)) {
    return failure(res, 403, "انتهت صلاحية هذه الصفحة، يرجى تحديث الصفحة والمحاولة مجدداً", {
      code: "CSRF_INVALID",
    });
  }
  next();
}

/* ============================================================
   مصادر الطلب
   trust proxy = 0 افتراضياً ⇒ req.ip هو عنوان المقبس الفعلي ولا يمكن تزويره.
============================================================ */
export function requestIp(req) {
  return req.ip || req.socket?.remoteAddress || "";
}

export function userAgent(req) {
  return String(req.headers["user-agent"] || "").slice(0, 300);
}

/* ============================================================
   معالج الأخطاء الموحد — لا تفاصيل تقنية تصل للعميل أبداً
============================================================ */
export function errorHandler(err, req, res, _next) {
  /* multer v2 */
  if (err?.name === "MulterError") {
    const map = {
      LIMIT_FILE_SIZE: `حجم الملف يتجاوز الحد الأقصى المسموح (${config.maxFileMB} ميغابايت)`,
      LIMIT_FILE_COUNT: `عدد الملفات يتجاوز الحد المسموح (${config.maxFilesPerRequest} ملفات)`,
      LIMIT_FIELD_COUNT: "الطلب يحتوي على حقول أكثر من المسموح",
      LIMIT_UNEXPECTED_FILE: "حقل الملف غير متوقع",
    };
    return res.status(413).json({ ok: false, error: map[err.code] || "تعذر رفع الملف، يرجى المحاولة مجدداً" });
  }

  if (err?.type === "entity.too.large") {
    return res.status(413).json({ ok: false, error: "حجم البيانات المرسلة أكبر من المسموح" });
  }

  const status = err.status || (err.code === "ERR_SQLITE_CONSTRAINT" || err.name === "SQLITE_CONSTRAINT" ? 409 : 500);

  if (status >= 500) {
    logger.error("unhandled route error", { method: req.method, path: req.originalUrl, err });
  } else {
    logger.debug("handled route error", { method: req.method, path: req.originalUrl, status, message: err.message });
  }

  const message =
    status >= 500 ? "تعذر تنفيذ الإجراء، يرجى إعادة المحاولة" : err.message || "تعذر تنفيذ الإجراء";

  if (res.headersSent) return;
  res.status(status).json({ ok: false, error: message });
}

/** معالج 404 لمقاطع API */
export function apiNotFound(req, res) {
  res.status(404).json({ ok: false, error: "الصفحة المطلوبة غير متوفرة" });
}
