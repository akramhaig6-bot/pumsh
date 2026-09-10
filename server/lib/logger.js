/**
 * مسجّل أحداث بسيط ومنظم (مستويات: debug/info/warn/error).
 * مخرجات JSON بسطر واحد في الإنتاج لسهولة الالتقاط من journald/مجمّع السجلات،
 * ونص مقروء في التطوير.
 *
 * قاعدة أمان صارمة: لا يمر عبر هذا المسجّل أي سر — لا كلمات مرور،
 * ولا توكنات جلسات، ولا روابط استعادة. الدالة redact() تفرض ذلك.
 */

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 };
const MIN = LEVELS[process.env.LOG_LEVEL] || LEVELS.info;

/** مفاتيح يجب ألا تصل إلى السجل أبداً مهما كان مصدرها */
const SENSITIVE = new Set([
  "password", "pass", "passwd", "current", "confirm", "temp",
  "token", "raw", "secret", "session", "sessionraw", "nama_sid", "nama_csrf",
  "authorization", "cookie", "cookies", "set-cookie",
  "pass_hash", "passhash", "salt", "hash",
  "smtp_pass", "mailpass", "x-csrf-token",
]);

const REDACTED = "[REDACTED]";

function redact(value, depth = 0) {
  if (value == null || depth > 6) return value;
  if (typeof value !== "object") return value;
  if (value instanceof Error) {
    return { name: value.name, message: value.message, status: value.status, code: value.code, stack: value.stack };
  }
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value)) {
    out[k] = SENSITIVE.has(String(k).toLowerCase()) ? REDACTED : redact(v, depth + 1);
  }
  return out;
}

function emit(level, msg, meta) {
  if (LEVELS[level] < MIN) return;
  const prod = process.env.NODE_ENV === "production";
  const time = new Date().toISOString();
  if (prod) {
    const line = { time, level, msg, ...(meta ? redact(meta) : {}) };
    process.stdout.write(`${JSON.stringify(line)}\n`);
    return;
  }
  const tag = level.toUpperCase().padEnd(5);
  const extra = meta ? ` ${JSON.stringify(redact(meta))}` : "";
  process.stdout.write(`[${time}] ${tag} ${msg}${extra}\n`);
}

export const logger = {
  debug: (msg, meta) => emit("debug", msg, meta),
  info: (msg, meta) => emit("info", msg, meta),
  warn: (msg, meta) => emit("warn", msg, meta),
  error: (msg, meta) => emit("error", msg, meta),
  child: (scope) => ({
    debug: (msg, meta) => emit("debug", `${scope} ${msg}`, meta),
    info: (msg, meta) => emit("info", `${scope} ${msg}`, meta),
    warn: (msg, meta) => emit("warn", `${scope} ${msg}`, meta),
    error: (msg, meta) => emit("error", `${scope} ${msg}`, meta),
  }),
  /** للاختبار/التحقق: هل المفتاح يُعدّ حساساً؟ */
  isSensitive: (k) => SENSITIVE.has(String(k).toLowerCase()),
  redact,
};

export default logger;
