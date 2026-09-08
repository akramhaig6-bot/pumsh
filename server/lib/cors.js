/* CORS مرن يدعم وضعي النشر:
   1) خادم واحد (VPS): بدون أي Origin خارجي → لا توجد ترويسات CORS، سلوك سابق 100%.
   2) واجهة على Vercel + خادم API منفصل: يُسمح لنطاقات الواجهة (PUBLIC_URL / CORS_ORIGINS)
      ولاحقات المراجعات (مثل *.vercel.app) مع credentials.
   يُستخدم أيضاً لاختيار سياسة الكوكيز (SameSite=None عند cross-origin) ولمصافحة socket.io. */
import { config } from "../config.js";

export function normalizeOrigin(u) {
  try { return new URL(u).origin; } catch { return (u || "").replace(/\/+$/, ""); }
}

/** هل يُسمح لهذا الأصل (من المتصفح) بالوصول cross-origin؟ */
export function isOriginAllowed(origin) {
  if (!origin) return false;
  const o = normalizeOrigin(origin);
  if (config.frontendOrigins.includes(o)) return true;
  return config.originSuffixes.some((s) => s && o.endsWith(s));
}

/** هل هذا الطلب قادم فعلاً من واجهة على نطاق مختلف عن نطاق الخادم؟ */
export function isCrossOriginRequest(req) {
  const origin = req.headers.origin;
  if (!origin || !isOriginAllowed(origin)) return false;
  const own = `${req.protocol}://${req.get("host") || ""}`;
  return normalizeOrigin(origin) !== normalizeOrigin(own);
}

/** وسيط Express: ترويسات CORS + معالجة preflight (OPTIONS) */
export function corsMiddleware(req, res, next) {
  const origin = req.headers.origin;
  if (origin && isOriginAllowed(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
    res.setHeader("Access-Control-Allow-Methods", "GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-CSRF-Token, Authorization");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
}
