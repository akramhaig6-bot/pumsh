import rateLimit from "express-rate-limit";
import { config } from "../config.js";

/**
 * حدود معدل الطلبات.
 *
 * [M6] مُقسَّمة بدقة: مسارات الاعتمادات (دخول/تسجيل/استعادة) لها حد مشدد،
 * بينما مسارات الحالة الخفيفة (csrf/me/captcha) تبقى ضمن الحد العام فقط —
 * وإلا فإن مجرد تحديث الصفحة عشرين مرة كان يطرد المستخدم من الدخول.
 *
 * ملاحظة [C4]: المفتاح هو req.ip. بما أن trust proxy = 0 افتراضياً،
 * فلا يمكن تزويره عبر X-Forwarded-For. إن وُضع Nginx أمام التطبيق
 * يجب ضبط TRUST_PROXY_HOPS=1 ليصبح العنوان الحقيقي هو المفتاح.
 */

const TOO_MANY = "عدد كبير من الطلبات في وقت قصير، يرجى الانتظار قليلاً والمحاولة مجدداً";

const base = {
  standardHeaders: "draft-7",
  legacyHeaders: false,
  /* لا نكشف عنوان IP في الرسائل */
  message: { ok: false, error: TOO_MANY },
};

/** حد عام على كل الطلبات */
export const generalLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: config.rateLimitGeneral,
});

/**
 * حد مشدد على مسارات الاعتمادات فقط:
 * POST /login, /register, /admin/login, /forgot, /reset, /change-password
 */
export const credentialLimiter = rateLimit({
  ...base,
  windowMs: 15 * 60_000,
  limit: config.rateLimitAuth,
  message: {
    ok: false,
    error: "تم إيقاف المحاولات مؤقتاً لمدة 15 دقيقة حفاظاً على الأمان، يرجى المحاولة لاحقاً",
  },
  /* الحظر يُحسب فقط على المحاولات الفعلية، لا على كل طلب */
  skipSuccessfulRequests: true,
});

/** حد رفع الملفات */
export const uploadLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: config.rateLimitUpload,
  message: { ok: false, error: "تم تجاوز حد الرفع المسموح مؤقتاً، يرجى الانتظار قليلاً والمحاولة مجدداً" },
});

/** [M11] حد مستقل لتسجيل نقرات البانرات (مسار عام بلا مصادقة) */
export const clickLimiter = rateLimit({
  ...base,
  windowMs: 60_000,
  limit: config.rateLimitClick,
  message: { ok: false, error: "تم تسجيل عدد كبير من النقرات، يرجى الانتظار قليلاً" },
});
