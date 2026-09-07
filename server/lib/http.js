import crypto from "node:crypto";
import { ZodError } from "zod";
import { getSessionUser, loadSession, revokeSession, touchSession } from "./util.js";

/* ---------------- أدوات Express ---------------- */
export const asyncH = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

export function failure(res, status, message, extra = {}) {
  return res.status(status).json({ ok: false, error: message, ...extra });
}

/** تحليل zod مع رسائل حقول موحدة */
export function parse(schema, data) {
  try {
    return { value: schema.parse(data) };
  } catch (e) {
    if (e instanceof ZodError) {
      const fields = {};
      for (const i of e.issues) {
        const p = (i.path[0] || "_") + "";
        fields[p] = fields[p] || i.message;
      }
      return { error: e.issues[0]?.message || "بيانات غير صالحة", fields };
    }
    return { error: "بيانات غير صالحة" };
  }
}

/* ---------------- المصادقة والصلاحيات ---------------- */
export function getRawToken(req) {
  const header = req.headers.authorization || "";
  if (header.startsWith("Bearer ")) return header.slice(7);
  return req.cookies?.nama_sid || "";
}

export function currentUser(req) {
  const raw = getRawToken(req);
  const s = loadSession(raw);
  if (!s) return null;
  touchSession(raw);
  req.sessionRaw = raw;
  return getSessionUser(raw);
}

export function requireAuth(req, res, next) {
  const user = currentUser(req);
  if (!user) return failure(res, 401, "انتهت جلستك، يرجى تسجيل الدخول مرة أخرى");
  if (!user.active) {
    revokeSession(req.sessionRaw);
    return failure(res, 403, "حسابك تم تعطيله، يرجى التواصل مع الإدارة");
  }
  req.user = user;
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user) return failure(res, 401, "انتهت جلستك");
  if (req.user.role !== "admin")
    return failure(res, 404, "الصفحة غير موجودة"); // عدم كشف لوحة الإدارة
  if (req.user.must_change && req.path !== "/api/admin/me/password")
    return failure(res, 403, "يجب تغيير كلمة المرور المؤقتة قبل المتابعة");
  next();
}

/** حماية CSRF: الكوكيز SameSite=Strict + إرسال ترويسة تطابق قيمة كوكيز CSRF */
export function csrfProtect(req, res, next) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const cookie = req.cookies?.nama_csrf || "";
  const header = req.headers["x-csrf-token"] || "";
  if (!cookie || cookie !== header) {
    return failure(res, 403, "طلب غير صالح");
  }
  next();
}

export function setCSRFCookie(req, res) {
  if (!req.cookies?.nama_csrf) {
    const value = crypto.randomBytes(24).toString("hex");
    res.cookie("nama_csrf", value, {
      httpOnly: false,
      sameSite: "strict",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 30 * 24 * 3600 * 1000,
    });
    res.locals.csrfToken = value;
  }
  return res.locals.csrfToken || req.cookies?.nama_csrf || "";
}

export function requestIp(req) {
  return req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress || "";
}

/* ---------------- معالج الأخطاء الموحد ---------------- */
export function errorHandler(err, req, res, _next) {
  const status = err.status || (err.name === "SQLITE_CONSTRAINT" ? 409 : 500);
  if (status >= 500) console.error("[error]", req.method, req.path, err);
  const message =
    status >= 500 ? "تعذر تنفيذ الإجراء، يرجى إعادة المحاولة" : err.message || "تعذر تنفيذ الإجراء";
  res.status(status).json({ ok: false, error: message });
}
