/**
 * [C2] سياسة CORS — صارمة ولا تعتمد على أي نطاق ثابت في الكود.
 *
 * القواعد:
 *  - الأصل يُقبل فقط إن كان ضمن config.allowedOrigins (من ALLOWED_ORIGINS في .env).
 *  - لا اعتماد على اللاحقات (suffix matching) — مُعطّلة ما لم يطلبها المشغّل صراحةً
 *    عبر CORS_ORIGIN_SUFFIXES، وحتى حينها يجب أن تكون اللاحقة نقطة-محددة.
 *  - نفس الأصل (same-origin) لا يحتاج ترويسات CORS إطلاقاً.
 *  - credentials تُمنح فقط للأصول المصرّح بها.
 */
import { config } from "../config.js";

export function normalizeOrigin(u) {
  try {
    return new URL(u).origin;
  } catch {
    return String(u || "").replace(/\/+$/, "");
  }
}

/** هل هذا الأصل مصرّح له صراحةً؟ */
export function isOriginAllowed(origin) {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  if (!o) return false;
  if (config.allowedOrigins.includes(o)) return true;

  /* اللاحقات: مرفوضة افتراضياً. إن فُعّلت صراحةً، نشترط أن تكون
     لاحقة نطاق حقيقية (تبدأ بنقطة) وأن يطابقها اسم مضيف كامل. */
  for (const s of config.originSuffixes) {
    if (!s.startsWith(".")) continue;
    let host = "";
    try {
      host = new URL(o).hostname;
    } catch {
      continue;
    }
    if (host.length > s.length && host.endsWith(s)) return true;
  }
  return false;
}

/** أصل هذا الطلب نفسه (من Host) — لمقارنة same-origin */
export function requestOrigin(req) {
  const proto = req.headers["x-forwarded-proto"]?.split(",")[0]?.trim() || req.protocol || "http";
  const host = req.headers["x-forwarded-host"]?.split(",")[0]?.trim() || req.get("host") || "";
  return normalizeOrigin(`${proto}://${host}`);
}

/** هل الطلب قادم فعلاً من أصل مختلف عن أصل الخادم؟ (يحدد سياسة الكوكيز) */
export function isCrossOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin) return false;
  if (!isOriginAllowed(origin)) return false;
  return normalizeOrigin(origin) !== requestOrigin(req);
}

/**
 * [M12] التحقق من Origin/Referer كطبقة دفاع ثانية ضد CSRF.
 * تُرجع null عند السلامة، أو سبب الرفض كنص.
 *  - الطلبات same-origin بلا Origin (تنقّل داخلي/أدوات) → مسموحة.
 *  - إن وُجد Origin → يجب أن يكون مطابقاً لأصل الخادم أو ضمن القائمة المسموحة.
 *  - إن غاب Origin ووجد Referer → نفحص Referer.
 */
export function checkRequestOrigin(req) {
  const own = requestOrigin(req);
  const origin = req.headers.origin ? normalizeOrigin(req.headers.origin) : "";

  if (origin) {
    if (origin === own) return null;
    if (isOriginAllowed(origin)) return null;
    return "origin_not_allowed";
  }

  const referer = req.headers.referer || req.headers.referrer || "";
  if (referer) {
    let refOrigin = "";
    try {
      refOrigin = normalizeOrigin(new URL(referer).origin);
    } catch {
      return "invalid_referer";
    }
    if (refOrigin === own) return null;
    if (isOriginAllowed(refOrigin)) return null;
    return "referer_not_allowed";
  }

  /* لا Origin ولا Referer: نسمح — المتصفحات ترسل Origin دائماً مع
     الطلبات العابرة للأصول، وغيابه يعني أن الطلب ليس cross-site. */
  return null;
}

/** وسيط Express: ترويسات CORS + معالجة preflight */
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", normalizeOrigin(origin));
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token");
    res.setHeader("Access-Control-Max-Age", "600");
  }
  if (req.method === "OPTIONS") {
    /* preflight لأصل غير مسموح: 204 بلا ترويسات سماح → يفشل الطلب في المتصفح */
    return res.sendStatus(204);
  }
  next();
}
