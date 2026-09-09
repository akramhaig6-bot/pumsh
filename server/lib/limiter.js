import rateLimit from "express-rate-limit";

/** حدود معدل الطلبات — حماية عامة وأخرى مشددة لمسارات الدخول */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 400,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "عدد كبير من الطلبات في وقت قصير، يرجى الانتظار قليلاً والمحاولة مجدداً" },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "تم إيقاف المحاولات مؤقتاً لمدة 15 دقيقة حفاظاً على الأمان، يرجى المحاولة لاحقاً" },
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { ok: false, error: "تم تجاوز حد الرفع المسموح مؤقتاً، يرجى الانتظار قليلاً والمحاولة مجدداً" },
});
