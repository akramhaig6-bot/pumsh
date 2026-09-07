import rateLimit from "express-rate-limit";

/** حدود معدل الطلبات — حماية عامة وأخرى مشددة لمسارات الدخول */
export const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 400,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "طلبات كثيرة جداً، حاول بعد قليل" },
});

export const authLimiter = rateLimit({
  windowMs: 15 * 60_000,
  limit: 40,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "محاولات كثيرة جداً، حاول بعد 15 دقيقة" },
});

export const uploadLimiter = rateLimit({
  windowMs: 60_000,
  limit: 60,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "رفع كثير، حاول بعد قليل" },
});
